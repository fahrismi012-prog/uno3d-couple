# UNO 3D Couple — Planning Document

Game UNO 3D online realtime untuk 2 pemain (LDR), mobile-friendly, dengan chat & voice call, semuanya pakai layanan free tier.

## 1. Konsep Produk

- **Pemain**: 2 orang (kamu & pacar), private room dengan kode room (contoh: `LOVE-1234`).
- **Platform**: Web app (buka di browser HP, tidak perlu install). Bisa "Add to Home Screen" (PWA) supaya terasa seperti app native.
- **Fitur inti (MVP)**:
  1. Buat / join room dengan kode
  2. Main UNO realtime (aturan standar: skip, reverse, +2, wild, +4, teriak "UNO!")
  3. Meja 3D: kartu 3D, animasi tarik & lempar kartu
  4. Text chat in-game (+ emoji / quick reactions ❤️😆😡)
  5. Voice call selama main (Tencent RTC / TRTC)
- **Fitur nanti (v2)**: skin kartu couple, skor & riwayat menang, avatar 3D, background musik, mode "kalau kalah harus…" (truth or dare).

## 2. Teknologi (semua free tier)

| Layer | Pilihan | Kenapa |
|---|---|---|
| 3D rendering | **Three.js + React Three Fiber** | Ringan di mobile browser, ekosistem besar, gratis |
| Frontend | **React + Vite + TypeScript** | Cepat, cocok dengan R3F |
| Realtime game | **Socket.IO** (WebSocket) | Simple, reconnect otomatis (penting di jaringan HP) |
| Backend | **Node.js + Express + Socket.IO** | Satu bahasa (TS) frontend-backend |
| Voice/Video | **Tencent RTC (TRTC)** | Free tier 10.000 menit/bulan — lebih dari cukup untuk 2 orang |
| Text chat | Lewat Socket.IO saja | Gratis, tidak perlu layanan tambahan (Tencent IM opsional) |
| Database | **Supabase (PostgreSQL)** free tier | Untuk akun sederhana, skor, riwayat. State game cukup di memory server |
| Hosting frontend | **Vercel** atau **Cloudflare Pages** | Gratis, CDN cepat |
| Hosting backend | **Fly.io** free / **Render** free / **Railway** trial | Perlu server yang support WebSocket long-lived |
| Aset 3D | Kenney.nl / Poly Pizza (CC0) + kartu bikin sendiri (texture PNG) | Gratis |

**Catatan biaya**: semuanya $0. Batasan free tier: Render free suka "tidur" setelah 15 menit idle (start ulang ±30 detik) — bisa diakali dengan ping/cron gratis (UptimeRobot).

## 3. Arsitektur

```
[HP Kamu] ──┐                       ┌── [HP Pacar]
            │  WebSocket (Socket.IO)│
            ▼                       ▼
     ┌─────────────────────────────────┐
     │  Game Server (Node.js, Fly.io)  │  ← state game di memory (authoritative)
     │  - room manager                 │
     │  - UNO rules engine             │
     │  - chat relay                   │
     │  - TRTC UserSig generator       │
     └───────────────┬─────────────────┘
                     │ (hanya untuk skor/akun)
              [Supabase Postgres]

Voice: HP ↔ Tencent TRTC cloud ↔ HP  (peer audio, terpisah dari game server)
```

Prinsip penting:
- **Server authoritative**: dek kartu, giliran, validasi kartu semua di server → tidak bisa curang / desync.
- Client hanya mengirim intent (`playCard`, `drawCard`, `sayUno`) dan me-render state yang dikirim server.
- **Reconnect**: kalau sinyal HP putus, pemain bisa join lagi ke room dan state dikirim ulang.
- **TRTC UserSig** harus digenerate di server (SDKSecretKey jangan pernah di frontend).

## 4. Database (Supabase) — skema minimal

```sql
players   (id, nickname, avatar, created_at)
matches   (id, room_code, player1_id, player2_id, winner_id, started_at, ended_at)
scores    (player_id, wins, losses, streak)
```

State permainan yang sedang berjalan TIDAK di database — cukup object di memory server (hanya 1 room, 2 pemain).

## 5. Desain UI/Gameplay (mobile-first)

- Orientasi **landscape**, meja 3D dilihat dari sudut pemain (kartu sendiri di bawah, lawan di atas).
- Kartu sendiri: fan/kipas di bawah layar, tap untuk main, drag ke tengah opsional.
- Tombol besar: Draw pile, tombol "UNO!", pemilih warna saat wild.
- Chat: drawer/bubble di sisi layar; quick emoji melayang di atas meja.
- Voice: tombol mute/unmute + indikator lawan bicara.
- Target performa: 30–60 fps di HP mid-range → low-poly, baked lighting, maksimal ~108 kartu instanced mesh.

## 6. Struktur Folder

```
uno3d-couple/
├── docs/
│   └── PLANNING.md
├── client/                      # React + Vite + R3F
│   ├── public/
│   │   └── assets/              # texture kartu, model, suara
│   ├── src/
│   │   ├── components/
│   │   │   ├── game/            # Table3D, Card3D, Hand, DrawPile, ColorPicker
│   │   │   ├── ui/              # HUD, ChatDrawer, UnoButton, Lobby
│   │   │   └── voice/           # TRTC join/leave, mute controls
│   │   ├── hooks/               # useSocket, useGameState, useTRTC
│   │   ├── scenes/              # LobbyScene, GameScene
│   │   ├── store/               # zustand state
│   │   ├── types/               # shared types (kartu, event)
│   │   └── main.tsx
│   └── package.json
├── server/                      # Node + Express + Socket.IO
│   ├── src/
│   │   ├── game/                # deck.ts, rules.ts, gameEngine.ts
│   │   ├── rooms/               # roomManager.ts
│   │   ├── sockets/             # event handlers
│   │   ├── trtc/                # userSig generator (secret di env)
│   │   ├── db/                  # supabase client, queries
│   │   └── index.ts
│   ├── .env.example             # TRTC_SDKAPPID, TRTC_SECRETKEY, SUPABASE_URL...
│   └── package.json
├── shared/                      # tipe & konstanta dipakai client+server
│   └── src/                     # cardTypes.ts, events.ts, gameState.ts
└── README.md
```

## 7. Roadmap Eksekusi

1. **Fase 1 — Core logic (1–2 hari)**: rules engine UNO di `shared`/`server` + unit test. Belum ada 3D.
2. **Fase 2 — Realtime (1–2 hari)**: Socket.IO room, join dengan kode, main UNO versi UI 2D sederhana dulu.
3. **Fase 3 — 3D (3–5 hari)**: meja & kartu 3D dengan R3F, animasi, mobile landscape layout.
4. **Fase 4 — Chat & Voice (1–2 hari)**: chat via socket, integrasi TRTC (daftar Tencent Cloud, ambil SDKAppID, UserSig dari server).
5. **Fase 5 — Deploy (1 hari)**: client → Vercel, server → Fly.io/Render, Supabase setup, tes HP berdua.
6. **Fase 6 — Polish**: PWA, suara, skin couple, skor.

## 8. Yang perlu disiapkan (akun gratis)

- [ ] Akun Tencent Cloud → aktifkan TRTC, catat SDKAppID & SecretKey
- [ ] Akun Supabase → buat project, catat URL & anon key
- [ ] Akun Vercel / Cloudflare Pages
- [ ] Akun Fly.io / Render untuk backend
- [ ] (Opsional) UptimeRobot untuk anti-sleep server free
