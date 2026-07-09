import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@uno3d/shared';

const URL = import.meta.env.VITE_SERVER_URL ?? `http://${location.hostname}:3001`;

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(URL, {
  autoConnect: true,
});

export function savedSession(): { playerId: string | null; roomCode: string | null; nickname: string } {
  return {
    playerId: localStorage.getItem('uno.playerId'),
    roomCode: localStorage.getItem('uno.roomCode'),
    nickname: localStorage.getItem('uno.nickname') ?? '',
  };
}

export function saveSession(playerId: string, roomCode: string, nickname: string): void {
  localStorage.setItem('uno.playerId', playerId);
  localStorage.setItem('uno.roomCode', roomCode);
  localStorage.setItem('uno.nickname', nickname);
}

export function clearSession(): void {
  localStorage.removeItem('uno.playerId');
  localStorage.removeItem('uno.roomCode');
}
