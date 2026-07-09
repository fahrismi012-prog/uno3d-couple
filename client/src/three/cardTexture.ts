import * as THREE from 'three';
import type { Card, Color } from '@uno3d/shared';

const COLOR_HEX: Record<Color | 'wild', string> = {
  red: '#e0342b',
  yellow: '#f7d117',
  green: '#379e37',
  blue: '#0f63c8',
  wild: '#1b1b1b',
};

const W = 256;
const H = 384;
const cache = new Map<string, THREE.CanvasTexture>();

function label(value: Card['value']): string {
  switch (value) {
    case 'skip': return '⊘';
    case 'reverse': return '⇄';
    case 'draw2': return '+2';
    case 'wild': return '★';
    case 'wild4': return '+4';
    default: return value;
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeCanvas(draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Muka kartu: warna solid + elips putih miring + label besar & kecil di pojok */
export function faceTexture(color: Card['color'], value: Card['value']): THREE.CanvasTexture {
  const key = `${color}:${value}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const tex = makeCanvas((ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = COLOR_HEX[color];
    roundedRect(ctx, 12, 12, W - 24, H - 24, 24);
    ctx.fill();

    // elips putih khas UNO
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-0.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.ellipse(0, 0, 88, 148, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // segi-4 warna untuk wild
    if (color === 'wild') {
      const cols: Color[] = ['red', 'blue', 'yellow', 'green'];
      cols.forEach((c, i) => {
        ctx.fillStyle = COLOR_HEX[c];
        ctx.beginPath();
        ctx.moveTo(W / 2, H / 2);
        ctx.arc(W / 2, H / 2, 70, (i * Math.PI) / 2 - 0.5, ((i + 1) * Math.PI) / 2 - 0.5);
        ctx.fill();
      });
    }

    const text = label(value);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 8;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 120px system-ui, sans-serif';
    ctx.strokeText(text, W / 2, H / 2 + 6);
    ctx.fillText(text, W / 2, H / 2 + 6);

    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.fillText(text, 44, 52);
    ctx.save();
    ctx.translate(W - 44, H - 52);
    ctx.rotate(Math.PI);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  });
  cache.set(key, tex);
  return tex;
}

/** Punggung kartu: hitam + elips merah + tulisan UNO */
export function backTexture(): THREE.CanvasTexture {
  const hit = cache.get('back');
  if (hit) return hit;
  const tex = makeCanvas((ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#141414';
    roundedRect(ctx, 12, 12, W - 24, H - 24, 24);
    ctx.fill();
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-0.5);
    ctx.fillStyle = '#e0342b';
    ctx.beginPath();
    ctx.ellipse(0, 0, 92, 150, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f7d117';
    ctx.font = 'bold 88px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('UNO', 0, 0);
    ctx.restore();
  });
  cache.set('back', tex);
  return tex;
}
