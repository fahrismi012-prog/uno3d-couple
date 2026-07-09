import { Card, COLORS, NumberValue } from './types.js';

/** RNG deterministik sederhana (mulberry32) supaya game bisa di-seed & di-test */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dek UNO standar: 108 kartu */
export function createDeck(): Card[] {
  const cards: Card[] = [];
  let n = 0;
  const push = (color: Card['color'], value: Card['value']) =>
    cards.push({ id: `c${n++}`, color, value });

  for (const color of COLORS) {
    push(color, '0');
    for (let v = 1; v <= 9; v++) {
      const val = String(v) as NumberValue;
      push(color, val);
      push(color, val);
    }
    for (const action of ['skip', 'reverse', 'draw2'] as const) {
      push(color, action);
      push(color, action);
    }
  }
  for (let i = 0; i < 4; i++) {
    push('wild', 'wild');
    push('wild', 'wild4');
  }
  return cards;
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
