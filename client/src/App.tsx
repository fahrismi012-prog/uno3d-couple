import { useEffect, useRef, useState } from 'react';
import type { Card, ChatMessage, Color, PlayerView } from '@uno3d/shared';
import { COLORS } from '@uno3d/shared';
import { clearSession, saveSession, savedSession, socket } from './socket';
import GameScene from './three/GameScene';
import { snd } from './sounds';
import { useVoice } from './voice/useVoice';
import VoiceButton from './voice/VoiceButton';
import './styles.css';

const COLOR_HEX: Record<Color, string> = {
  red: '#e53935',
  yellow: '#fdd835',
  green: '#43a047',
  blue: '#1e88e5',
};

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
  const voice = useVoice();

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
    const last = chat[chat.length - 1];
    if (last && view && last.from !== view.you) snd.chat();
  }, [chat]);

  // efek suara berdasarkan perubahan state
  const prev = useRef<PlayerView | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (!view || !p || view.phase === 'lobby') return;
    if (p.phase === 'playing' && view.phase === 'finished') {
      view.winner === view.you ? snd.win() : snd.lose();
      return;
    }
    if (p.phase !== 'playing' || view.phase !== 'playing') return;
    if (p.topCard?.id !== view.topCard?.id) snd.play();
    else if (view.hand.length > p.hand.length) snd.draw();
    if (view.opponentId && !p.unoSaid[view.opponentId] && view.unoSaid[view.opponentId]) snd.uno();
    if (p.currentPlayer !== view.you && view.currentPlayer === view.you) snd.turn();
  }, [view]);

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

  const leaveRoom = () => {
    if (!confirm('Keluar dari room ini? Skor room akan hilang.')) return;
    socket.emit('leaveRoom', () => {});
    voice.leave();
    clearSession();
    setView(null);
    setChat([]);
    setError('');
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
        <VoiceButton voice={voice} />
        <span>{connected ? '🟢' : '🔴'}</span>
        <button className="btn-leave" onClick={leaveRoom} title="Keluar room">🚪</button>
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
            <span className="score">
              🏆 {view.nicknames[view.you]} {view.wins[view.you] ?? 0} — {view.opponentId ? (view.wins[view.opponentId] ?? 0) : 0} {oppName}
            </span>
            <span>{oppName ?? 'Lawan'} — {view.opponentCount} kartu
              {view.opponentId && view.unoSaid[view.opponentId] ? ' · UNO!' : ''}
            </span>
            {view.opponentId && view.opponentCount === 1 && !view.unoSaid[view.opponentId] && (
              <button onClick={() => socket.emit('catchUno', ackHandler)}>Tangkap UNO! 👉</button>
            )}
          </div>

          <div className="scene">
            <GameScene
              view={view}
              myTurn={myTurn}
              onPlay={play}
              onDraw={() => socket.emit('drawCard', ackHandler)}
            />
          </div>

          <p className="turn">
            <span
              className="color-dot"
              style={{ background: view.currentColor ? COLOR_HEX[view.currentColor] : '#999' }}
            />
            {view.phase === 'finished'
              ? (view.winner === view.you ? '🏆 KAMU MENANG! 🎉' : `${oppName} menang! 😤 Rematch?`)
              : myTurn ? '✨ Giliranmu! (tap kartu, atau tap dek untuk tarik)' : `Giliran ${oppName}…`}
            {error && <span className="error"> {error}</span>}
          </p>

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
        <div className="row emoji-row">
          {['❤️', '😂', '😱', '😡', '😘'].map((e) => (
            <button key={e} className="btn-emoji" onClick={() => socket.emit('chat', e)}>{e}</button>
          ))}
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
