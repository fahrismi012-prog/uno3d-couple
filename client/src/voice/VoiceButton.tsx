import { VoiceState } from './useVoice';

export default function VoiceButton({ voice }: { voice: VoiceState }) {
  if (voice.status === 'incoming') {
    return (
      <span className="voice">
        <span>📞 Pasanganmu menelepon</span>
        <button className="btn-voice" onClick={voice.accept} title="Terima voice call">
          Terima
        </button>
        <button className="btn-voice" onClick={voice.decline} title="Tolak voice call">
          Tolak
        </button>
      </span>
    );
  }
  if (voice.status === 'off' || voice.status === 'error') {
    return (
      <span className="voice">
        <button className="btn-voice" onClick={voice.join} title="Mulai voice call">
          📞 Voice
        </button>
        {voice.status === 'error' && <span className="voice-err">{voice.error}</span>}
      </span>
    );
  }
  if (voice.status === 'connecting') {
    return (
      <span className="voice">
        📞 menghubungkan…
        <button className="btn-voice" onClick={voice.leave} title="Batalkan">
          Batal
        </button>
      </span>
    );
  }
  return (
    <span className="voice">
      <span className={voice.remoteTalking ? 'talking' : ''}>
        {voice.remoteTalking ? '🔊' : '🎧'}
      </span>
      <button className="btn-voice" onClick={voice.toggleMute}>
        {voice.muted ? '🔇 Unmute' : '🎤 Mute'}
      </button>
      <button className="btn-voice" onClick={voice.leave} title="Akhiri voice">
        ❌
      </button>
    </span>
  );
}
