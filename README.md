# UNO Berdua 💕

Game UNO 3D online realtime untuk 2 pemain, dengan chat & voice call (WebRTC peer-to-peer, gratis).
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

## Voice call (gratis, tanpa layanan pihak ketiga)

Voice call memakai **WebRTC peer-to-peer bawaan browser**. Audio mengalir langsung
antar HP; server Socket.IO hanya meneruskan sinyal `offer` / `answer` / `candidate`
(signaling), tidak pernah menyentuh audio. Tidak perlu daftar akun atau isi API key.

- Tekan **📞 Voice** di header → pasanganmu melihat tombol **Terima / Tolak**.
- Butuh izin mikrofon di browser (wajib HTTPS di produksi; `localhost` juga boleh).
- STUN gratis dipakai untuk menemukan jalur koneksi. Kalau jaringan HP terlalu ketat
  (NAT simetris/CGNAT), dipakai TURN gratis dari Open Relay Project sebagai cadangan.
- Override TURN lewat env client (opsional):

```bash
VITE_TURN_URL=turn:servermu:3478 \
VITE_TURN_USERNAME=user \
VITE_TURN_CREDENTIAL=pass \
npm run dev -w client
```

Biaya: **$0** — tidak ada menit/tagihan.

## Test

```bash
npm test          # unit test rules engine (19 test)
```

## Struktur

- `shared/` — tipe kartu, dek, rules engine UNO, kontrak event Socket.IO
- `server/` — Node + Express + Socket.IO: room, validasi, chat, relay signaling voice
- `client/` — React + Vite + React Three Fiber: meja 3D, HUD, chat, voice WebRTC
