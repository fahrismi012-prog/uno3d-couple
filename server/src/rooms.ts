import { randomBytes, randomUUID } from 'node:crypto';
import {
  Card,
  GameState,
  PlayerView,
  createGame,
  currentPlayer,
  topCard,
} from '@uno3d/shared';

export interface RoomPlayer {
  id: string;
  nickname: string;
  socketId: string | null;
}

export interface Room {
  code: string;
  players: RoomPlayer[];
  game: GameState | null;
  createdAt: number;
}

const rooms = new Map<string, Room>();
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;

const WORDS = ['LOVE', 'CINTA', 'SAYANG', 'RINDU', 'BABY', 'HONEY'];

function makeCode(): string {
  const word = WORDS[randomBytes(1)[0] % WORDS.length];
  const num = (randomBytes(2).readUInt16BE(0) % 9000) + 1000;
  return `${word}-${num}`;
}

export function createRoom(nickname: string): { room: Room; playerId: string } {
  let code = makeCode();
  while (rooms.has(code)) code = makeCode();
  const playerId = randomUUID();
  const room: Room = {
    code,
    players: [{ id: playerId, nickname, socketId: null }],
    game: null,
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return { room, playerId };
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.trim().toUpperCase());
}

/** Join room baru, atau reconnect kalau playerId sudah terdaftar di room */
export function joinRoom(
  code: string,
  nickname: string,
  playerId: string | null,
): { room: Room; playerId: string } | { error: string } {
  const room = getRoom(code);
  if (!room) return { error: 'Room tidak ditemukan' };

  if (playerId) {
    const existing = room.players.find((p) => p.id === playerId);
    if (existing) {
      if (nickname) existing.nickname = nickname;
      return { room, playerId };
    }
  }
  if (room.players.length >= 2) return { error: 'Room sudah penuh' };

  const id = randomUUID();
  room.players.push({ id, nickname, socketId: null });
  return { room, playerId: id };
}

export function deleteRoomIfEmpty(room: Room): void {
  if (room.players.every((p) => p.socketId === null) && room.game === null) {
    rooms.delete(room.code);
  }
}

export function cleanupStaleRooms(): void {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > ROOM_TTL_MS) rooms.delete(code);
  }
}

export function startGame(room: Room): string | null {
  if (room.players.length !== 2) return 'Tunggu pasanganmu join dulu';
  room.game = createGame([room.players[0].id, room.players[1].id]);
  return null;
}

/** View per pemain: sembunyikan tangan lawan & isi draw pile */
export function viewFor(room: Room, playerId: string): PlayerView {
  const g = room.game;
  const nicknames = Object.fromEntries(room.players.map((p) => [p.id, p.nickname]));
  const opponent = room.players.find((p) => p.id !== playerId) ?? null;

  if (!g) {
    return {
      roomCode: room.code,
      you: playerId,
      nicknames,
      hand: [] as Card[],
      opponentId: opponent?.id ?? null,
      opponentCount: 0,
      topCard: null,
      currentColor: null,
      currentPlayer: null,
      drawPileCount: 0,
      drawnCardId: null,
      unoSaid: {},
      phase: 'lobby',
      winner: null,
    };
  }

  return {
    roomCode: room.code,
    you: playerId,
    nicknames,
    hand: g.hands[playerId] ?? [],
    opponentId: opponent?.id ?? null,
    opponentCount: opponent ? (g.hands[opponent.id]?.length ?? 0) : 0,
    topCard: topCard(g),
    currentColor: g.currentColor,
    currentPlayer: currentPlayer(g),
    drawPileCount: g.drawPile.length,
    drawnCardId: currentPlayer(g) === playerId ? g.drawnCardId : null,
    unoSaid: g.unoSaid,
    phase: g.phase,
    winner: g.winner,
  };
}
