import { createDeck, makeRng, shuffle } from './deck.js';
import { Card, Color, GameState, PlayResult } from './types.js';

const HAND_SIZE = 7;

export function createGame(players: [string, string], seed = Date.now()): GameState {
  const rng = makeRng(seed);
  let pile = shuffle(createDeck(), rng);

  const hands: Record<string, Card[]> = {};
  for (const p of players) hands[p] = pile.splice(0, HAND_SIZE);

  // kartu pembuka tidak boleh wild/wild4 — taruh lagi di bawah pile
  let first = pile.shift()!;
  while (first.color === 'wild') {
    pile.push(first);
    first = pile.shift()!;
  }

  return {
    players: [...players],
    hands,
    drawPile: pile,
    discardPile: [first],
    currentColor: first.color as Color,
    currentPlayerIndex: 0,
    direction: 1,
    phase: 'playing',
    drawnCardId: null,
    unoSaid: Object.fromEntries(players.map((p) => [p, false])),
    winner: null,
  };
}

export function currentPlayer(state: GameState): string {
  return state.players[state.currentPlayerIndex];
}

export function topCard(state: GameState): Card {
  return state.discardPile[state.discardPile.length - 1];
}

export function canPlay(card: Card, state: GameState): boolean {
  if (card.color === 'wild') return true;
  const top = topCard(state);
  return card.color === state.currentColor || card.value === top.value;
}

function clone(state: GameState): GameState {
  return structuredClone(state);
}

function fail(error: string): PlayResult {
  return { ok: false, error };
}

function advanceTurn(s: GameState, skip = false): void {
  const steps = skip ? 2 : 1;
  const len = s.players.length;
  s.currentPlayerIndex =
    (s.currentPlayerIndex + s.direction * steps + len * steps) % len;
  s.drawnCardId = null;
}

/** ambil n kartu dari drawPile ke tangan pemain, reshuffle discard kalau habis */
function dealTo(s: GameState, playerId: string, n: number): Card[] {
  const taken: Card[] = [];
  for (let i = 0; i < n; i++) {
    if (s.drawPile.length === 0) {
      if (s.discardPile.length <= 1) break; // benar-benar habis: berhenti
      const top = s.discardPile.pop()!;
      s.drawPile = shuffle(s.discardPile, makeRng(s.drawPile.length + i + 1));
      s.discardPile = [top];
    }
    taken.push(s.drawPile.shift()!);
  }
  s.hands[playerId].push(...taken);
  if (taken.length > 0) s.unoSaid[playerId] = false;
  return taken;
}

export function playCard(
  state: GameState,
  playerId: string,
  cardId: string,
  chosenColor?: Color,
): PlayResult {
  if (state.phase !== 'playing') return fail('Permainan sudah selesai');
  if (currentPlayer(state) !== playerId) return fail('Bukan giliranmu');
  if (state.drawnCardId !== null && cardId !== state.drawnCardId)
    return fail('Setelah menarik kartu, hanya kartu itu yang boleh dimainkan (atau pass)');

  const hand = state.hands[playerId];
  const card = hand?.find((c) => c.id === cardId);
  if (!card) return fail('Kartu tidak ada di tanganmu');
  if (!canPlay(card, state)) return fail('Kartu tidak cocok dengan kartu teratas');
  if (card.color === 'wild' && !chosenColor)
    return fail('Pilih warna untuk kartu wild');

  const s = clone(state);
  s.hands[playerId] = s.hands[playerId].filter((c) => c.id !== cardId);
  s.discardPile.push(card);
  s.currentColor = card.color === 'wild' ? chosenColor! : card.color;
  s.drawnCardId = null;

  if (s.hands[playerId].length === 0) {
    s.phase = 'finished';
    s.winner = playerId;
    return { ok: true, state: s };
  }

  const opponent = s.players.find((p) => p !== playerId)!;
  switch (card.value) {
    case 'skip':
    case 'reverse': // di 2 pemain, reverse = skip
      advanceTurn(s, true);
      break;
    case 'draw2':
      dealTo(s, opponent, 2);
      advanceTurn(s, true);
      break;
    case 'wild4':
      dealTo(s, opponent, 4);
      advanceTurn(s, true);
      break;
    default:
      advanceTurn(s);
  }
  return { ok: true, state: s };
}

/** Tarik 1 kartu. Kalau kartunya bisa dimainkan, pemain boleh mainkan atau pass. */
export function drawCard(state: GameState, playerId: string): PlayResult {
  if (state.phase !== 'playing') return fail('Permainan sudah selesai');
  if (currentPlayer(state) !== playerId) return fail('Bukan giliranmu');
  if (state.drawnCardId !== null) return fail('Kamu sudah menarik kartu giliran ini');

  const s = clone(state);
  const [card] = dealTo(s, playerId, 1);
  if (!card) return fail('Tidak ada kartu tersisa untuk ditarik');

  if (canPlay(card, s)) {
    s.drawnCardId = card.id; // tunggu keputusan: mainkan atau pass
  } else {
    advanceTurn(s);
  }
  return { ok: true, state: s };
}

/** Pass hanya boleh setelah menarik kartu yang sebenarnya playable */
export function pass(state: GameState, playerId: string): PlayResult {
  if (state.phase !== 'playing') return fail('Permainan sudah selesai');
  if (currentPlayer(state) !== playerId) return fail('Bukan giliranmu');
  if (state.drawnCardId === null) return fail('Kamu harus menarik kartu dulu');

  const s = clone(state);
  advanceTurn(s);
  return { ok: true, state: s };
}

/** Teriak UNO — sah saat sisa 2 kartu (mau main) atau sudah 1 kartu */
export function sayUno(state: GameState, playerId: string): PlayResult {
  if (state.phase !== 'playing') return fail('Permainan sudah selesai');
  const n = state.hands[playerId]?.length ?? 0;
  if (n > 2) return fail('Kartumu masih terlalu banyak untuk UNO');
  const s = clone(state);
  s.unoSaid[playerId] = true;
  return { ok: true, state: s };
}

/** Lawan menangkap pemain yang lupa bilang UNO saat kartunya tinggal 1 → penalti 2 kartu */
export function catchUno(state: GameState, callerId: string): PlayResult {
  if (state.phase !== 'playing') return fail('Permainan sudah selesai');
  const target = state.players.find((p) => p !== callerId)!;
  if (state.hands[target].length !== 1 || state.unoSaid[target])
    return fail('Tidak ada yang bisa ditangkap');

  const s = clone(state);
  dealTo(s, target, 2);
  return { ok: true, state: s };
}
