import { useEffect, useRef, useState } from 'react';
import type { Card, ChatMessage, Color, PlayerView } from '@uno3d/shared';
import { COLORS } from '@uno3d/shared';
import { clearSession, saveSession, savedSession, socket } from './socket';
import './styles.css';

const COLOR_HEX: Record<Color, string> = {
  red: '#e53935',
  yellow: '#fdd835',
  green: '#43a047',
  blue: '#1e88e5',
};

function cardLabel(c: Card): string {
  switch (c.value) {
    case 'skip': return '⊘';
    case 'reverse': return '⇄';
    case 'draw2': return '+2';
    case 'wild': return 'W';
    case 'wild4': return '+4';
    default: return c.value;
  }
}

function CardFace({ card, onClick, disabled, highlight }: {
  card: Card; onClick?: () => void; disabled?: boolean; highlight?: boolean;
}) {
  const bg = card.color === 'wild' ? '#212121' : COLOR_HEX[card.color];
  return (
    <button
      className={`card ${highlight ? 'card-highlight' : ''}`}
      style={{ background: bg }}
      onClick={onClick}
      disabled={disabled}
    >
      {cardLabel(card)}
    </button>
  );
}

export default function App() {
  const [view, setView] = useState<PlayerView | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [nickname, setNickname] = useState(savedSession().nickname);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [pendingWild, setPendingWild] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [connected, setConnected] = useState(socket.connected);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    socket.on('state', setView);
    socket.on('chat', (m) => setChat((c) => [...c.slice(-99), m]));
    socket.on('opponentLeft', () => setError('Pasanganmu terputus… menunggu dia kembali 💔'));
    socket.on('opponentJoined', () => setError(''));
    const onConnect = () => {
      setConnected(true);
      const s = savedSession();
      if (s.roomCode && s.playerId) {
        socket.emit('joinRoom', s.roomCode, s.nickname, s.playerId, (ack) => {
          if (!ack.ok) clearSession();
        });
      }
    };
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) onConnect();
    return () => {
      socket.off('state', setView);
      socket.off('chat');
      socket.off('opponentLeft');
      socket.off('opponentJoined');
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  const ackHandler = (ack: { ok: boolean; error?: string }) => {
    setError(ack.ok ? '' : (ack.error ?? 'Gagal'));
  };

  const create = () => {
    socket.emit('createRoom', nickname, (ack) => {
      if (ack.ok) saveSession(ack.playerId!, ack.roomCode!, nickname);
      else setError(ack.error ?? 'Gagal membuat room');
    });
  };

  const join = () => {
    socket.emit('joinRoom', joinCode, nickname, null, (ack) => {
      if (ack.ok) saveSession(ack.playerId!, ack.roomCode!, nickname);
      else setError(ack.error ?? 'Gagal join');
    });
  };

  const play = (card: Card) => {
    if (card.color === 'wild') { setPendingWild(card.id); return; }
    socket.emit('playCard', card.id, null, ackHandler);
  };

  const playWild = (color: Color) => {
    if (!pendingWild) return;
    socket.emit('playCard', pendingWild, color, ackHandler);
    setPendingWild(null);
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    socket.emit('chat', chatInput);
    setChatInput('');
  };

  // ---------- Lobby (belum join room) ----------
  if (!view) {
    return (
      <div className="lobby">
        <h1>UNO Berdua 💕</h1>
        <p className={connected ? 'ok' : 'warn'}>
          {connected ? 'Terhubung ke server' : 'Menghubungkan…'}
        </p>
        <input
          placeholder="Nama panggilanmu"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
        />
        <button className="btn-primary" onClick={create} disabled={!connected}>
          Buat Room Baru
        </button>
        <div className="row">
          <input
            placeholder="Kode room (mis. LOVE-1234)"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          />
          <button onClick={join} disabled={!connected}>Join</button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  const myTurn = view.currentPlayer === view.you;
  const oppName = view.opponentId ? view.nicknames[view.opponentId] : null;

  // ---------- Room / permainan ----------
  return (
    <div className="game">
      <header>
        <span className="room-code">Room: <b>{view.roomCode}</b></span>
        <span>{connected ? '🟢' : '🔴'}</span>
      </header>

      {view.phase === 'lobby' && (
        <div className="center-panel">
          {oppName
            ? <>
                <p><b>{oppName}</b> sudah di sini! 🎉</p>
                <button className="btn-primary" onClick={() => socket.emit('startGame', ackHandler)}>
                  Mulai Main!
                </button>
              </>
            : <p>Kirim kode <b>{view.roomCode}</b> ke pasanganmu dan tunggu dia join… ⏳</p>}
        </div>
      )}

      {view.phase !== 'lobby' && (
        <>
          <div className="opponent">
            <span>{oppName ?? 'Lawan'} — {view.opponentCount} kartu
              {view.opponentId && view.unoSaid[view.opponentId] ? ' · UNO!' : ''}
            </span>
            {view.opponentId && view.opponentCount === 1 && !view.unoSaid[view.opponentId] && (
              <button onClick={() => socket.emit('catchUno', ackHandler)}>Tangkap UNO! 👉</button>
            )}
          </div>

          <div className="table">
            <div className="pile">
              <button
                className="card card-back"
                onClick={() => socket.emit('drawCard', ackHandler)}
                disabled={!myTurn || view.drawnCardId !== null}
              >
                {view.drawPileCount}
              </button>
              <span className="pile-label">Tarik</span>
            </div>
            {view.topCard && (
              <div className="pile">
                <CardFace card={view.topCard} disabled />
                <span
                  className="color-dot"
                  style={{ background: view.currentColor ? COLOR_HEX[view.currentColor] : '#999' }}
                />
              </div>
            )}
          </div>

          <p className="turn">
            {view.phase === 'finished'
              ? (view.winner === view.you ? '🏆 KAMU MENANG! 🎉' : `${oppName} menang! 😤 Rematch?`)
              : myTurn ? '✨ Giliranmu!' : `Giliran ${oppName}…`}
            {error && <span className="error"> {error}</span>}
          </p>

          <div className="hand">
            {view.hand.map((c) => (
              <CardFace
                key={c.id}
                card={c}
                onClick={() => play(c)}
                disabled={!myTurn || view.phase === 'finished'}
                highlight={view.drawnCardId === c.id}
              />
            ))}
          </div>

          <div className="actions">
            {view.drawnCardId !== null && (
              <button onClick={() => socket.emit('pass', ackHandler)}>Pass ➡️</button>
            )}
            {view.hand.length <= 2 && !view.unoSaid[view.you] && view.phase === 'playing' && (
              <button className="btn-uno" onClick={() => socket.emit('sayUno', ackHandler)}>
                UNO!
              </button>
            )}
            {view.phase === 'finished' && (
              <button className="btn-primary" onClick={() => socket.emit('startGame', ackHandler)}>
                Main Lagi 🔄
              </button>
            )}
          </div>

          {pendingWild && (
            <div className="modal" onClick={() => setPendingWild(null)}>
              <div className="modal-box" onClick={(e) => e.stopPropagation()}>
                <p>Pilih warna:</p>
                <div className="color-picker">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      className="color-btn"
                      style={{ background: COLOR_HEX[c] }}
                      onClick={() => playWild(c)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="chat">
        <div className="chat-log">
          {chat.map((m, i) => (
            <div key={i} className={m.from === view.you ? 'msg mine' : 'msg'}>
              <b>{m.nickname}:</b> {m.text}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="row">
          <input
            placeholder="Chat…"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendChat()}
          />
          <button onClick={sendChat}>➤</button>
        </div>
      </div>
    </div>
  );
}
