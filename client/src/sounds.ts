/** Efek suara disintesis WebAudio — tanpa file audio */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// browser mengharuskan AudioContext dibangunkan oleh gesture pengguna
if (typeof window !== 'undefined') {
  const wake = () => {
    audio();
    window.removeEventListener('pointerdown', wake);
  };
  window.addEventListener('pointerdown', wake);
}

function tone(
  freq: number,
  dur: number,
  opts: { type?: OscillatorType; vol?: number; delay?: number; slide?: number } = {},
): void {
  const ac = audio();
  if (!ac) return;
  const { type = 'triangle', vol = 0.12, delay = 0, slide = 0 } = opts;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const snd = {
  /** kartu dilempar ke meja */
  play(): void {
    tone(520, 0.09, { type: 'triangle', slide: -180 });
    tone(180, 0.05, { type: 'square', vol: 0.05, delay: 0.02 });
  },
  /** menarik kartu */
  draw(): void {
    tone(300, 0.07, { type: 'sine', slide: 120 });
  },
  /** giliranmu */
  turn(): void {
    tone(660, 0.09, { vol: 0.08 });
    tone(880, 0.12, { vol: 0.08, delay: 0.09 });
  },
  /** teriak UNO */
  uno(): void {
    tone(700, 0.1, { type: 'square', vol: 0.09 });
    tone(933, 0.16, { type: 'square', vol: 0.09, delay: 0.1 });
  },
  chat(): void {
    tone(1040, 0.06, { type: 'sine', vol: 0.06 });
  },
  win(): void {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { vol: 0.11, delay: i * 0.13 }));
  },
  lose(): void {
    [392, 330, 262].forEach((f, i) => tone(f, 0.28, { type: 'sawtooth', vol: 0.06, delay: i * 0.16 }));
  },
};
