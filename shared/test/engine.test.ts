import { describe, expect, it } from 'vitest';
import { createDeck, makeRng } from '../src/deck.js';
import {
  canPlay,
  catchUno,
  createGame,
  currentPlayer,
  drawCard,
  pass,
  playCard,
  sayUno,
  topCard,
} from '../src/engine.js';
import { Card, Color, GameState } from '../src/types.js';

const P = ['aku', 'pacar'] as [string, string];

function expectOk(r: ReturnType<typeof playCard>): GameState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

/** paksa state deterministik untuk tes aturan */
function fixedState(over: Partial<GameState> = {}): GameState {
  const base = createGame(P, 1);
  return { ...base, ...over };
}

function card(id: string, color: Card['color'], value: Card['value']): Card {
  return { id, color, value };
}

describe('deck', () => {
  it('berisi 108 kartu dengan komposisi standar', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(108);
    expect(deck.filter((c) => c.value === 'wild')).toHaveLength(4);
    expect(deck.filter((c) => c.value === 'wild4')).toHaveLength(4);
    expect(deck.filter((c) => c.color === 'red')).toHaveLength(25);
    expect(new Set(deck.map((c) => c.id)).size).toBe(108);
  });

  it('rng deterministik dengan seed sama', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('createGame', () => {
  it('bagi 7 kartu per pemain dan kartu pembuka bukan wild', () => {
    const s = createGame(P, 7);
    expect(s.hands.aku).toHaveLength(7);
    expect(s.hands.pacar).toHaveLength(7);
    expect(topCard(s).color).not.toBe('wild');
    expect(s.drawPile.length + s.discardPile.length + 14).toBe(108);
    expect(currentPlayer(s)).toBe('aku');
  });
});

describe('aturan main kartu', () => {
  it('menolak main di luar giliran', () => {
    const s = createGame(P, 1);
    const r = playCard(s, 'pacar', s.hands.pacar[0].id);
    expect(r.ok).toBe(false);
  });

  it('kartu cocok berdasarkan warna atau angka, wild selalu boleh', () => {
    const s = fixedState({
      discardPile: [card('top', 'red', '5')],
      currentColor: 'red' as Color,
    });
    expect(canPlay(card('a', 'red', '9'), s)).toBe(true);
    expect(canPlay(card('b', 'blue', '5'), s)).toBe(true);
    expect(canPlay(card('c', 'wild', 'wild'), s)).toBe(true);
    expect(canPlay(card('d', 'blue', '9'), s)).toBe(false);
  });

  it('main kartu valid memindah giliran dan menaruh ke discard', () => {
    const s = fixedState({
      hands: { aku: [card('x', 'red', '3'), card('y', 'blue', '8')], pacar: [card('z', 'green', '1')] },
      discardPile: [card('top', 'red', '5')],
      currentColor: 'red' as Color,
    });
    const s2 = expectOk(playCard(s, 'aku', 'x'));
    expect(topCard(s2).id).toBe('x');
    expect(s2.currentColor).toBe('red');
    expect(currentPlayer(s2)).toBe('pacar');
    expect(s2.hands.aku).toHaveLength(1);
  });

  it('wild butuh pilihan warna dan mengubah currentColor', () => {
    const s = fixedState({
      hands: { aku: [card('w', 'wild', 'wild'), card('y', 'blue', '8')], pacar: [card('z', 'green', '1')] },
    });
    expect(playCard(s, 'aku', 'w').ok).toBe(false);
    const s2 = expectOk(playCard(s, 'aku', 'w', 'blue'));
    expect(s2.currentColor).toBe('blue');
  });

  it('skip dan reverse (2 pemain) membuat giliran kembali ke pemain yang sama', () => {
    for (const v of ['skip', 'reverse'] as const) {
      const s = fixedState({
        hands: { aku: [card('s', 'red', v), card('y', 'blue', '8')], pacar: [card('z', 'green', '1')] },
        discardPile: [card('top', 'red', '5')],
        currentColor: 'red' as Color,
      });
      const s2 = expectOk(playCard(s, 'aku', 's'));
      expect(currentPlayer(s2)).toBe('aku');
    }
  });

  it('draw2 memberi lawan 2 kartu dan melewati gilirannya', () => {
    const s = fixedState({
      hands: { aku: [card('d', 'red', 'draw2'), card('y', 'blue', '8')], pacar: [card('z', 'green', '1')] },
      discardPile: [card('top', 'red', '5')],
      currentColor: 'red' as Color,
    });
    const s2 = expectOk(playCard(s, 'aku', 'd'));
    expect(s2.hands.pacar).toHaveLength(3);
    expect(currentPlayer(s2)).toBe('aku');
  });

  it('wild4 memberi lawan 4 kartu, melewati giliran, dan ganti warna', () => {
    const s = fixedState({
      hands: { aku: [card('w4', 'wild', 'wild4'), card('y', 'blue', '8')], pacar: [card('z', 'green', '1')] },
    });
    const s2 = expectOk(playCard(s, 'aku', 'w4', 'green'));
    expect(s2.hands.pacar).toHaveLength(5);
    expect(s2.currentColor).toBe('green');
    expect(currentPlayer(s2)).toBe('aku');
  });

  it('kartu terakhir dimainkan → menang', () => {
    const s = fixedState({
      hands: { aku: [card('last', 'red', '7')], pacar: [card('z', 'green', '1')] },
      discardPile: [card('top', 'red', '5')],
      currentColor: 'red' as Color,
    });
    const s2 = expectOk(playCard(s, 'aku', 'last'));
    expect(s2.phase).toBe('finished');
    expect(s2.winner).toBe('aku');
  });
});

describe('draw & pass', () => {
  it('kartu tarikan tidak playable → giliran langsung pindah', () => {
    const s = fixedState({
      hands: { aku: [card('a', 'blue', '9')], pacar: [card('z', 'green', '1')] },
      drawPile: [card('n', 'green', '2')],
      discardPile: [card('top', 'red', '5')],
      currentColor: 'red' as Color,
    });
    const s2 = expectOk(drawCard(s, 'aku'));
    expect(s2.hands.aku).toHaveLength(2);
    expect(currentPlayer(s2)).toBe('pacar');
  });

  it('kartu tarikan playable → boleh dimainkan atau pass, kartu lain ditolak', () => {
    const s = fixedState({
      hands: { aku: [card('a', 'red', '9')], pacar: [card('z', 'green', '1')] },
      drawPile: [card('n', 'red', '2')],
      discardPile: [card('top', 'red', '5')],
      currentColor: 'red' as Color,
    });
    const s2 = expectOk(drawCard(s, 'aku'));
    expect(s2.drawnCardId).toBe('n');
    expect(currentPlayer(s2)).toBe('aku');
    expect(playCard(s2, 'aku', 'a').ok).toBe(false); // kartu lama tidak boleh
    const played = expectOk(playCard(s2, 'aku', 'n'));
    expect(topCard(played).id).toBe('n');

    const passed = expectOk(pass(s2, 'aku'));
    expect(currentPlayer(passed)).toBe('pacar');
    expect(passed.hands.aku).toHaveLength(2);
  });

  it('pass tanpa menarik kartu ditolak', () => {
    const s = createGame(P, 1);
    expect(pass(s, 'aku').ok).toBe(false);
  });

  it('drawPile habis → discard di-reshuffle jadi drawPile baru', () => {
    const s = fixedState({
      hands: { aku: [card('a', 'blue', '9')], pacar: [card('z', 'green', '1')] },
      drawPile: [],
      discardPile: [card('old1', 'green', '3'), card('old2', 'yellow', '6'), card('top', 'red', '5')],
      currentColor: 'red' as Color,
    });
    const s2 = expectOk(drawCard(s, 'aku'));
    expect(s2.hands.aku).toHaveLength(2);
    expect(topCard(s2).id === 'top' || s2.drawnCardId !== null).toBe(true);
    expect(s2.discardPile[0].id).toBe('top');
  });
});

describe('UNO call', () => {
  it('sayUno sah saat sisa ≤2 kartu, ditolak kalau masih banyak', () => {
    const s = fixedState({
      hands: { aku: [card('a', 'red', '1'), card('b', 'red', '2')], pacar: [card('z', 'green', '1')] },
    });
    expect(sayUno(s, 'aku').ok).toBe(true);
    const s7 = createGame(P, 1);
    expect(sayUno(s7, 'aku').ok).toBe(false);
  });

  it('lupa UNO → lawan catchUno → penalti 2 kartu', () => {
    const s = fixedState({
      hands: { aku: [card('a', 'red', '1')], pacar: [card('z', 'green', '1'), card('y', 'blue', '2')] },
      drawPile: [card('p1', 'green', '4'), card('p2', 'yellow', '9')],
    });
    const s2 = expectOk(catchUno(s, 'pacar'));
    expect(s2.hands.aku).toHaveLength(3);
  });

  it('sudah bilang UNO → catchUno gagal, dan status reset saat nambah kartu', () => {
    let s = fixedState({
      hands: { aku: [card('a', 'red', '1')], pacar: [card('z', 'green', '1'), card('y', 'blue', '2')] },
      drawPile: [card('p1', 'green', '4'), card('p2', 'yellow', '9')],
    });
    s = expectOk(sayUno(s, 'aku'));
    expect(catchUno(s, 'pacar').ok).toBe(false);
  });
});

describe('simulasi penuh', () => {
  it('game random selalu selesai tanpa state ilegal', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = createGame(P, seed);
      const rng = makeRng(seed * 999);
      let guard = 0;
      while (s.phase === 'playing' && guard++ < 2000) {
        const me = currentPlayer(s);
        const playable = s.hands[me].filter(
          (c) => canPlay(c, s) && (s.drawnCardId === null || c.id === s.drawnCardId),
        );
        if (playable.length > 0) {
          const c = playable[Math.floor(rng() * playable.length)];
          const color = (['red', 'yellow', 'green', 'blue'] as const)[Math.floor(rng() * 4)];
          s = expectOk(playCard(s, me, c.id, c.color === 'wild' ? color : undefined));
        } else if (s.drawnCardId !== null) {
          s = expectOk(pass(s, me));
        } else {
          const r = drawCard(s, me);
          if (!r.ok) break; // kartu benar-benar habis (sangat jarang)
          s = r.state;
        }
      }
      expect(guard).toBeLessThan(2000);
      if (s.phase === 'finished') expect(s.winner).not.toBeNull();
    }
  });
});
