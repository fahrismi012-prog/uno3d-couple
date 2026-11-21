import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceSignal } from '@uno3d/shared';
import { savedSession, socket } from '../socket';

export type VoiceStatus = 'off' | 'connecting' | 'on' | 'incoming' | 'error';

export interface VoiceState {
  status: VoiceStatus;
  muted: boolean;
  remoteTalking: boolean;
  error: string;
  join: () => void;
  accept: () => void;
  decline: () => void;
  leave: () => void;
  toggleMute: () => void;
}

/**
 * Voice call peer-to-peer pakai WebRTC bawaan browser — gratis, tanpa layanan
 * pihak ketiga. Socket.IO yang sudah ada dipakai sebagai jalur signaling
 * (offer/answer/ICE candidate). Server game tidak pernah menyentuh audio.
 */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

// TURN gratis (Open Relay Project) — jaring pengaman kalau NAT/jaringan HP
// terlalu ketat untuk koneksi langsung. Bisa ditimpa lewat env VITE_TURN_*.
const turnUrl = import.meta.env.VITE_TURN_URL ?? 'turn:openrelay.metered.ca:443';
const turnUser = import.meta.env.VITE_TURN_USERNAME ?? 'openrelayproject';
const turnCred = import.meta.env.VITE_TURN_CREDENTIAL ?? 'openrelayproject';
ICE_SERVERS.push({
  urls: [turnUrl, 'turns:openrelay.metered.ca:443'],
  username: turnUser,
  credential: turnCred,
});

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'Gagal memulai voice call';
}

export function useVoice(): VoiceState {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const incomingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const remoteDescSetRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const volumeTimerRef = useRef<number | null>(null);

  const [status, setStatus] = useState<VoiceStatus>('off');
  const [muted, setMuted] = useState(false);
  const [remoteTalking, setRemoteTalking] = useState(false);
  const [error, setError] = useState('');

  const statusRef = useRef<VoiceStatus>('off');
  const mutedRef = useRef(false);

  const setVoiceStatus = useCallback((next: VoiceStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const teardown = useCallback(
    (next: VoiceStatus = 'off') => {
      if (volumeTimerRef.current !== null) {
        window.clearInterval(volumeTimerRef.current);
        volumeTimerRef.current = null;
      }
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;

      if (audioRef.current) audioRef.current.srcObject = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;

      const pc = pcRef.current;
      pcRef.current = null;
      if (pc) {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.close();
      }

      pendingCandidatesRef.current = [];
      incomingOfferRef.current = null;
      remoteDescSetRef.current = false;
      mutedRef.current = false;
      setMuted(false);
      setRemoteTalking(false);
      setVoiceStatus(next);
    },
    [setVoiceStatus],
  );

  const startVolumeMeter = useCallback((stream: MediaStream) => {
    const AudioCtor = window.AudioContext;
    if (!AudioCtor) return;
    try {
      const ac = new AudioCtor();
      audioCtxRef.current = ac;
      const source = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      volumeTimerRef.current = window.setInterval(() => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        setRemoteTalking(sum / data.length > 12);
      }, 200);
    } catch {
      // meter volume cuma hiasan — abaikan kalau WebAudio tidak tersedia
    }
  }, []);

  const createPeer = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    remoteDescSetRef.current = false;

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('voiceSignal', { kind: 'candidate', candidate: e.candidate.toJSON() });
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      const el = audioRef.current;
      if (el) {
        el.srcObject = stream;
        el.play().catch(() => {});
      }
      startVolumeMeter(stream);
    };

    pc.onconnectionstatechange = () => {
      if (pc !== pcRef.current) return;
      if (pc.connectionState === 'connected') {
        setError('');
        setVoiceStatus('on');
      } else if (pc.connectionState === 'failed') {
        setError('Koneksi voice gagal — coba lagi');
        teardown('error');
      }
    };

    return pc;
  }, [setVoiceStatus, startVolumeMeter, teardown]);

  const getMic = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    localStreamRef.current = stream;
    return stream;
  }, []);

  const flushCandidates = useCallback(async (pc: RTCPeerConnection) => {
    const pending = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];
    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // kandidat basi — abaikan
      }
    }
  }, []);

  const addCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = pcRef.current;
    if (!pc || !remoteDescSetRef.current) {
      pendingCandidatesRef.current.push(candidate);
      return;
    }
    try {
      await pc.addIceCandidate(candidate);
    } catch {
      // abaikan kandidat yang tidak cocok
    }
  }, []);

  const join = useCallback(async () => {
    if (statusRef.current === 'on' || statusRef.current === 'connecting') return;
    setError('');
    pendingCandidatesRef.current = [];
    incomingOfferRef.current = null;
    setVoiceStatus('connecting');
    try {
      const pc = createPeer();
      const stream = await getMic();
      for (const track of stream.getTracks()) pc.addTrack(track, stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('voiceSignal', { kind: 'offer', sdp: offer.sdp });
    } catch (e) {
      setError(errText(e));
      teardown('error');
    }
  }, [createPeer, getMic, setVoiceStatus, teardown]);

  const accept = useCallback(async () => {
    const offer = incomingOfferRef.current;
    if (!offer) return;
    setError('');
    setVoiceStatus('connecting');
    try {
      const pc = createPeer();
      const stream = await getMic();
      for (const track of stream.getTracks()) pc.addTrack(track, stream);
      await pc.setRemoteDescription(offer);
      remoteDescSetRef.current = true;
      incomingOfferRef.current = null;
      await flushCandidates(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('voiceSignal', { kind: 'answer', sdp: answer.sdp });
    } catch (e) {
      setError(errText(e));
      teardown('error');
    }
  }, [createPeer, flushCandidates, getMic, setVoiceStatus, teardown]);

  const handleOffer = useCallback(
    async (from: string, sdp: string) => {
      const pc = pcRef.current;
      if (pc && pc.signalingState === 'have-local-offer') {
        // dua-duanya menekan Voice bersamaan → pola "perfect negotiation":
        // satu pihak (polite) membatalkan offer-nya sendiri.
        const myId = savedSession().playerId ?? socket.id ?? '';
        const polite = myId > from;
        if (!polite) return;
        try {
          await pc.setLocalDescription({ type: 'rollback' });
          await pc.setRemoteDescription({ type: 'offer', sdp });
          remoteDescSetRef.current = true;
          await flushCandidates(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('voiceSignal', { kind: 'answer', sdp: answer.sdp });
          setVoiceStatus('connecting');
        } catch (e) {
          setError(errText(e));
          teardown('error');
        }
        return;
      }
      if (statusRef.current === 'on' || statusRef.current === 'connecting') return;
      if (pc && pc.signalingState !== 'stable') return;
      incomingOfferRef.current = { type: 'offer', sdp };
      setError('');
      setVoiceStatus('incoming');
    },
    [flushCandidates, setVoiceStatus, teardown],
  );

  const handleAnswer = useCallback(
    async (sdp: string) => {
      const pc = pcRef.current;
      if (!pc || pc.signalingState !== 'have-local-offer') return;
      try {
        await pc.setRemoteDescription({ type: 'answer', sdp });
        remoteDescSetRef.current = true;
        await flushCandidates(pc);
      } catch (e) {
        setError(errText(e));
        teardown('error');
      }
    },
    [flushCandidates, teardown],
  );

  const hangup = useCallback(() => {
    socket.emit('voiceSignal', { kind: 'bye' });
    teardown('off');
  }, [teardown]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream || statusRef.current !== 'on') return;
    const next = !mutedRef.current;
    mutedRef.current = next;
    for (const track of stream.getAudioTracks()) track.enabled = !next;
    setMuted(next);
  }, []);

  useEffect(() => {
    const el = new Audio();
    el.autoplay = true;
    el.setAttribute('playsinline', 'true');
    audioRef.current = el;
    return () => {
      el.pause();
      el.srcObject = null;
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onSignal = (from: string, signal: VoiceSignal) => {
      if (signal.kind === 'offer' && typeof signal.sdp === 'string') {
        void handleOffer(from, signal.sdp);
      } else if (signal.kind === 'answer' && typeof signal.sdp === 'string') {
        void handleAnswer(signal.sdp);
      } else if (signal.kind === 'candidate' && signal.candidate) {
        void addCandidate(signal.candidate);
      } else if (signal.kind === 'bye') {
        setError('');
        teardown('off');
      }
    };
    socket.on('voiceSignal', onSignal);
    return () => {
      socket.off('voiceSignal', onSignal);
    };
  }, [addCandidate, handleAnswer, handleOffer, teardown]);

  useEffect(() => {
    return () => teardown('off');
  }, [teardown]);

  return {
    status,
    muted,
    remoteTalking,
    error,
    join,
    accept,
    decline: hangup,
    leave: hangup,
    toggleMute,
  };
}
