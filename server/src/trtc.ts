import { createHmac } from 'node:crypto';
import { deflateSync } from 'node:zlib';

/**
 * Generator UserSig Tencent TRTC (algoritma TLS-Sig-API v2).
 * SDKSecretKey hanya boleh ada di server — jangan pernah dikirim ke client.
 */

const SDK_APP_ID = Number(process.env.TRTC_SDKAPPID ?? 0);
const SECRET_KEY = process.env.TRTC_SECRETKEY ?? '';
const EXPIRE_SECONDS = 24 * 60 * 60; // 1 hari, cukup untuk sesi main

export function trtcConfigured(): boolean {
  return SDK_APP_ID > 0 && SECRET_KEY.length > 0;
}

function base64UrlTrtc(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '*').replace(/\//g, '-').replace(/=/g, '_');
}

export function genUserSig(userId: string, now = Math.floor(Date.now() / 1000)): string {
  const content =
    `TLS.identifier:${userId}\n` +
    `TLS.sdkappid:${SDK_APP_ID}\n` +
    `TLS.time:${now}\n` +
    `TLS.expire:${EXPIRE_SECONDS}\n`;
  const sig = createHmac('sha256', SECRET_KEY).update(content).digest('base64');

  const doc = {
    'TLS.ver': '2.0',
    'TLS.identifier': userId,
    'TLS.sdkappid': SDK_APP_ID,
    'TLS.expire': EXPIRE_SECONDS,
    'TLS.time': now,
    'TLS.sig': sig,
  };
  return base64UrlTrtc(deflateSync(Buffer.from(JSON.stringify(doc))));
}

export function trtcCredentials(userId: string): { sdkAppId: number; userSig: string } {
  return { sdkAppId: SDK_APP_ID, userSig: genUserSig(userId) };
}
