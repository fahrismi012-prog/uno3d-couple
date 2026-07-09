import { Card, Color } from './types.js';

/** State yang dikirim ke tiap pemain — tangan lawan & draw pile disembunyikan */
export interface PlayerView {
  roomCode: string;
  you: string;
  nicknames: Record<string, string>;
  hand: Card[];
  opponentId: string | null;
  opponentCount: number;
  topCard: Card | null;
  currentColor: Color | null;
  currentPlayer: string | null;
  drawPileCount: number;
  /** id kartu yang baru kamu tarik dan boleh dimainkan/pass (hanya milikmu) */
  drawnCardId: string | null;
  unoSaid: Record<string, boolean>;
  phase: 'lobby' | 'playing' | 'finished';
  winner: string | null;
}

export interface ChatMessage {
  from: string;
  nickname: string;
  text: string;
  at: number;
}

export interface JoinAck {
  ok: boolean;
  error?: string;
  roomCode?: string;
  playerId?: string;
}

export interface ActionAck {
  ok: boolean;
  error?: string;
}

export interface VoiceCredsAck {
  ok: boolean;
  error?: string;
  sdkAppId?: number;
  userSig?: string;
  userId?: string;
  strRoomId?: string;
}

export interface ClientToServerEvents {
  createRoom: (nickname: string, cb: (ack: JoinAck) => void) => void;
  joinRoom: (
    roomCode: string,
    nickname: string,
    playerId: string | null,
    cb: (ack: JoinAck) => void,
  ) => void;
  startGame: (cb: (ack: ActionAck) => void) => void;
  playCard: (cardId: string, chosenColor: Color | null, cb: (ack: ActionAck) => void) => void;
  drawCard: (cb: (ack: ActionAck) => void) => void;
  pass: (cb: (ack: ActionAck) => void) => void;
  sayUno: (cb: (ack: ActionAck) => void) => void;
  catchUno: (cb: (ack: ActionAck) => void) => void;
  chat: (text: string) => void;
  voiceCreds: (cb: (ack: VoiceCredsAck) => void) => void;
}

export interface ServerToClientEvents {
  state: (view: PlayerView) => void;
  chat: (msg: ChatMessage) => void;
  opponentLeft: () => void;
  opponentJoined: (nickname: string) => void;
}
