export const COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type Color = (typeof COLORS)[number];

export type NumberValue =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
export type ActionValue = 'skip' | 'reverse' | 'draw2';
export type WildValue = 'wild' | 'wild4';
export type CardValue = NumberValue | ActionValue | WildValue;

export interface Card {
  id: string;
  color: Color | 'wild';
  value: CardValue;
}

export type Phase = 'playing' | 'finished';

export interface GameState {
  players: string[];
  hands: Record<string, Card[]>;
  drawPile: Card[];
  discardPile: Card[];
  /** Warna aktif (bisa beda dari kartu teratas kalau wild) */
  currentColor: Color;
  currentPlayerIndex: number;
  direction: 1 | -1;
  phase: Phase;
  /** id kartu yang baru saja ditarik dan boleh langsung dimainkan/pass */
  drawnCardId: string | null;
  /** pemain yang sudah teriak UNO (di-reset saat kartunya nambah) */
  unoSaid: Record<string, boolean>;
  winner: string | null;
}

export type PlayResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string };
