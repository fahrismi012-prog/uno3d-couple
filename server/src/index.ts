import { createServer } from 'node:http';
import express from 'express';
import { Server, Socket } from 'socket.io';
import {
  ClientToServerEvents,
  Color,
  PlayResult,
  ServerToClientEvents,
  catchUno,
  drawCard,
  pass,
  playCard,
  sayUno,
} from '@uno3d/shared';
import {
  Room,
  cleanupStaleRooms,
  createRoom,
  deleteRoomIfEmpty,
  getRoom,
  joinRoom,
  leaveRoom,
  startGame,
  viewFor,
} from './rooms.js';
import { trtcConfigured, trtcCredentials } from './trtc.js';

const PORT = Number(process.env.PORT ?? 3001);

const app = express();
app.get('/health', (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN ?? '*' },
});

interface SocketData {
  roomCode: string | null;
  playerId: string | null;
}

type Sock = Socket<ClientToServerEvents, ServerToClientEvents> & { data: SocketData };

function broadcastState(room: Room): void {
  for (const p of room.players) {
    if (p.socketId) io.to(p.socketId).emit('state', viewFor(room, p.id));
  }
}

function bind(socket: Sock, room: Room, playerId: string, nickname: string): void {
  socket.data.roomCode = room.code;
  socket.data.playerId = playerId;
  const me = room.players.find((p) => p.id === playerId)!;
  const rebind = me.socketId !== null;
  me.socketId = socket.id;
  socket.join(room.code);
  if (!rebind) {
    for (const p of room.players) {
      if (p.id !== playerId && p.socketId) {
        io.to(p.socketId).emit('opponentJoined', nickname);
      }
    }
  }
  broadcastState(room);
}

/** ambil konteks room+player dari socket; null kalau belum join */
function ctx(socket: Sock): { room: Room; playerId: string } | null {
  const { roomCode, playerId } = socket.data;
  if (!roomCode || !playerId) return null;
  const room = getRoom(roomCode);
  if (!room) return null;
  return { room, playerId };
}

function applyAction(
  socket: Sock,
  cb: (ack: { ok: boolean; error?: string }) => void,
  action: (roomPlayerId: string, room: Room) => PlayResult,
): void {
  const c = ctx(socket);
  if (!c || !c.room.game) return cb({ ok: false, error: 'Belum ada permainan' });
  const result = action(c.playerId, c.room);
  if (!result.ok) return cb({ ok: false, error: result.error });
  const justFinished = c.room.game.phase === 'playing' && result.state.phase === 'finished';
  c.room.game = result.state;
  if (justFinished && result.state.winner) {
    c.room.wins[result.state.winner] = (c.room.wins[result.state.winner] ?? 0) + 1;
  }
  broadcastState(c.room);
  cb({ ok: true });
}

io.on('connection', (rawSocket) => {
  const socket = rawSocket as Sock;
  socket.data = { roomCode: null, playerId: null };

  socket.on('createRoom', (nickname, cb) => {
    const name = String(nickname ?? '').trim().slice(0, 20) || 'Pemain';
    const { room, playerId } = createRoom(name);
    bind(socket, room, playerId, name);
    cb({ ok: true, roomCode: room.code, playerId });
  });

  socket.on('joinRoom', (code, nickname, playerId, cb) => {
    const name = String(nickname ?? '').trim().slice(0, 20) || 'Pemain';
    const result = joinRoom(String(code ?? ''), name, playerId);
    if ('error' in result) return cb({ ok: false, error: result.error });
    bind(socket, result.room, result.playerId, name);
    cb({ ok: true, roomCode: result.room.code, playerId: result.playerId });
  });

  socket.on('startGame', (cb) => {
    const c = ctx(socket);
    if (!c) return cb({ ok: false, error: 'Belum join room' });
    if (c.room.game && c.room.game.phase === 'playing')
      return cb({ ok: false, error: 'Permainan sedang berjalan' });
    const error = startGame(c.room);
    if (error) return cb({ ok: false, error });
    broadcastState(c.room);
    cb({ ok: true });
  });

  socket.on('playCard', (cardId, chosenColor, cb) =>
    applyAction(socket, cb, (pid, room) =>
      playCard(room.game!, pid, String(cardId), (chosenColor as Color) ?? undefined),
    ),
  );
  socket.on('drawCard', (cb) =>
    applyAction(socket, cb, (pid, room) => drawCard(room.game!, pid)),
  );
  socket.on('pass', (cb) => applyAction(socket, cb, (pid, room) => pass(room.game!, pid)));
  socket.on('sayUno', (cb) => applyAction(socket, cb, (pid, room) => sayUno(room.game!, pid)));
  socket.on('catchUno', (cb) =>
    applyAction(socket, cb, (pid, room) => catchUno(room.game!, pid)),
  );

  socket.on('chat', (text) => {
    const c = ctx(socket);
    if (!c) return;
    const clean = String(text ?? '').trim().slice(0, 300);
    if (!clean) return;
    const me = c.room.players.find((p) => p.id === c.playerId)!;
    io.to(c.room.code).emit('chat', {
      from: c.playerId,
      nickname: me.nickname,
      text: clean,
      at: Date.now(),
    });
  });

  socket.on('leaveRoom', (cb) => {
    const c = ctx(socket);
    if (!c) return cb({ ok: false, error: 'Belum join room' });
    leaveRoom(c.room, c.playerId);
    socket.leave(c.room.code);
    socket.data.roomCode = null;
    socket.data.playerId = null;
    for (const p of c.room.players) {
      if (p.socketId) io.to(p.socketId).emit('opponentLeft');
    }
    broadcastState(c.room);
    cb({ ok: true });
  });

  socket.on('voiceCreds', (cb) => {
    const c = ctx(socket);
    if (!c) return cb({ ok: false, error: 'Belum join room' });
    if (!trtcConfigured())
      return cb({ ok: false, error: 'Voice belum dikonfigurasi di server' });
    const { sdkAppId, userSig } = trtcCredentials(c.playerId);
    cb({ ok: true, sdkAppId, userSig, userId: c.playerId, strRoomId: c.room.code });
  });

  socket.on('disconnect', () => {
    const c = ctx(socket);
    if (!c) return;
    const me = c.room.players.find((p) => p.id === c.playerId);
    if (me && me.socketId === socket.id) me.socketId = null;
    for (const p of c.room.players) {
      if (p.id !== c.playerId && p.socketId) io.to(p.socketId).emit('opponentLeft');
    }
    deleteRoomIfEmpty(c.room);
  });
});

setInterval(cleanupStaleRooms, 60 * 60 * 1000);

httpServer.listen(PORT, () => {
  console.log(`UNO server listening on :${PORT}`);
});
