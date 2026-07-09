import { useEffect, useRef, useState } from 'react';
import TRTC from 'trtc-sdk-v5';
import { socket } from '../socket';

export type VoiceStatus = 'off' | 'connecting' | 'on' | 'error';

export interface VoiceState {
  status: VoiceStatus;
  muted: boolean;
  remoteTalking: boolean;
  error: string;
  join: () => void;
  leave: () => void;
  toggleMute: () => void;
}

export function useVoice(): VoiceState {
  const trtcRef = useRef<ReturnType<typeof TRTC.create> | null>(null);
  const [status, setStatus] = useState<VoiceStatus>('off');
  const [muted, setMuted] = useState(false);
  const [remoteTalking, setRemoteTalking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    return () => {
      trtcRef.current?.exitRoom().catch(() => {});
      trtcRef.current?.destroy();
      trtcRef.current = null;
    };
  }, []);

  const join = () => {
    if (status === 'on' || status === 'connecting') return;
    setStatus('connecting');
    setError('');
    socket.emit('voiceCreds', async (ack) => {
      if (!ack.ok) {
        setStatus('error');
        setError(ack.error ?? 'Gagal mengambil kredensial voice');
        return;
      }
      try {
        const trtc = trtcRef.current ?? TRTC.create();
        trtcRef.current = trtc;
        trtc.on(TRTC.EVENT.AUDIO_VOLUME, (event) => {
          const remote = event.result.find((r) => r.userId !== '' && r.userId !== ack.userId);
          setRemoteTalking((remote?.volume ?? 0) > 8);
        });
        await trtc.enterRoom({
          sdkAppId: ack.sdkAppId!,
          userId: ack.userId!,
          userSig: ack.userSig!,
          strRoomId: ack.strRoomId!,
          scene: TRTC.TYPE.SCENE_RTC,
        });
        await trtc.startLocalAudio();
        trtc.enableAudioVolumeEvaluation(300);
        setMuted(false);
        setStatus('on');
      } catch (e) {
        setStatus('error');
        setError(e instanceof Error ? e.message : 'Gagal masuk voice room');
      }
    });
  };

  const leave = () => {
    const trtc = trtcRef.current;
    if (trtc) {
      trtc.stopLocalAudio().catch(() => {});
      trtc.exitRoom().catch(() => {});
    }
    setStatus('off');
    setRemoteTalking(false);
  };

  const toggleMute = () => {
    const trtc = trtcRef.current;
    if (!trtc || status !== 'on') return;
    const next = !muted;
    trtc.updateLocalAudio({ mute: next }).catch(() => {});
    setMuted(next);
  };

  return { status, muted, remoteTalking, error, join, leave, toggleMute };
}
