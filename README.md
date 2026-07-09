# UNO Berdua 💕

Game UNO 3D online realtime untuk 2 pemain, dengan chat & voice call (Tencent TRTC).
Rencana lengkap: [docs/PLANNING.md](docs/PLANNING.md).

## Jalankan lokal

```bash
npm install

# Terminal 1 — server (ganti port kalau 3001 terpakai)
PORT=3005 npm run dev -w server

# Terminal 2 — client
VITE_SERVER_URL=http://localhost:3005 npm run dev -w client
```

Buka URL Vite di dua tab/HP (HP lain di WiFi yang sama: pakai IP komputer).
Satu pemain "Buat Room Baru", kirim kodenya, satunya "Join".

## Mengaktifkan voice call (Tencent TRTC)

1. Daftar di [Tencent Cloud](https://console.tencentcloud.com), aktifkan produk **TRTC**.
2. Buat aplikasi TRTC → catat **SDKAppID** dan **SDKSecretKey**.
3. Salin `server/.env.example` ke `server/.env`, isi `TRTC_SDKAPPID` dan `TRTC_SECRETKEY`.
4. Restart server. Tombol **📞 Voice** di header akan berfungsi.

UserSig digenerate di server (TLS-Sig-API v2) — SecretKey tidak pernah dikirim ke browser.
Free tier TRTC: 10.000 menit/bulan.

## Test

```bash
npm test          # unit test rules engine (19 test)
```

## Struktur

- `shared/` — tipe kartu, dek, rules engine UNO, kontrak event Socket.IO
- `server/` — Node + Express + Socket.IO: room, validasi, chat, UserSig TRTC
- `client/` — React + Vite + React Three Fiber: meja 3D, HUD, chat, voice
