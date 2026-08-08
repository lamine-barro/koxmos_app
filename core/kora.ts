import { getDeviceId } from './profile';
import { NativeModules } from 'react-native';

type MediaStream = import('react-native-webrtc').MediaStream;

const endpoint = process.env.EXPO_PUBLIC_KOXMOS_AGENT_URL;

async function broker<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!endpoint) throw new Error('Configurez EXPO_PUBLIC_KOXMOS_AGENT_URL.');
  const response = await fetch(`${endpoint.replace(/\/$/, '')}${path}`, { ...init, headers: { 'Content-Type': 'application/json', 'X-Koxmos-Device-Id': await getDeviceId(), ...(init.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Kora est indisponible.');
  return data as T;
}

type Bootstrap = { sessionId: string; iceConfig?: unknown };
export type LiveTranscript = { speaker: 'talent' | 'agent'; text: string; isFinal?: boolean };

function asText(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
function readTranscript(raw: string): LiveTranscript | null {
  try {
    const event = JSON.parse(raw) as Record<string, unknown>;
    const type = asText(event.type).toLowerCase();
    const text = asText(event.text) || asText(event.transcript) || asText(event.delta) || asText((event.item as Record<string, unknown> | undefined)?.transcript);
    if (!text) return null;
    const speaker = /user|input|talent|caller/.test(type) ? 'talent' : /agent|assistant|output|response/.test(type) ? 'agent' : null;
    return speaker ? { speaker, text, isFinal: /final|completed|done/.test(type) } : null;
  } catch { return null; }
}

function reportsOf(stats: unknown) {
  if (stats instanceof Map) return [...stats.values()] as Record<string, unknown>[];
  if (Array.isArray(stats)) return stats as Record<string, unknown>[];
  return Object.values(stats as Record<string, Record<string, unknown>>);
}

export async function startKoraConversation(input: { billingSessionId: string; level: string; summary?: string; tutor?: string; voiceId?: string; onRemoteStream: (stream: MediaStream) => void; onStatus: (status: string) => void; onAudioLevel?: (levels: { talent: number; agent: number }) => void; onTranscript?: (turn: LiveTranscript) => void }) {
  if (!NativeModules.WebRTCModule && !NativeModules.RTCModule) {
    throw new Error('La fonction vocale nécessite une version récente de Koxmos sur ce téléphone.');
  }
  const { mediaDevices, RTCPeerConnection, RTCSessionDescription } = require('react-native-webrtc') as typeof import('react-native-webrtc');
  const bootstrap = await broker<Bootstrap>('/v1/kora/connect', { method: 'POST', body: JSON.stringify({ billingSessionId: input.billingSessionId, level: input.level, summary: input.summary, tutor: input.tutor, voiceId: input.voiceId }) });
  const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
  const peer = new RTCPeerConnection((bootstrap.iceConfig || {}) as any);
  let peerConnectionId = ''; const pendingCandidates: unknown[] = [];
  const flushCandidates = async () => { if (!peerConnectionId || !pendingCandidates.length) return; const candidates = pendingCandidates.splice(0, pendingCandidates.length); await broker(`/v1/kora/${bootstrap.sessionId}/ice`, { method: 'POST', body: JSON.stringify({ pc_id: peerConnectionId, candidates }) }); };
  stream.getTracks().forEach((track) => peer.addTrack(track, stream));
  peer.ontrack = (event: any) => { if (event.streams[0]) input.onRemoteStream(event.streams[0]); };
  peer.ondatachannel = (event: any) => {
    event.channel.onmessage = (message: any) => {
      const turn = readTranscript(String(message.data || ''));
      if (turn) input.onTranscript?.(turn);
    };
  };
  peer.onconnectionstatechange = () => input.onStatus(peer.connectionState);
  peer.onicecandidate = (event: any) => { if (!event.candidate) return; pendingCandidates.push(event.candidate.toJSON()); void flushCandidates(); };
  const offer = await peer.createOffer({ offerToReceiveAudio: true }); await peer.setLocalDescription(offer);
  const answer = await broker<{ sdp: string; type?: string; pc_id: string }>(`/v1/kora/${bootstrap.sessionId}/offer`, { method: 'POST', body: JSON.stringify({ sdp: offer.sdp }) });
  peerConnectionId = answer.pc_id; await peer.setRemoteDescription(new RTCSessionDescription({ type: answer.type || 'answer', sdp: answer.sdp })); await flushCandidates();
  const meter = setInterval(() => {
    void peer.getStats().then((stats: unknown) => {
      let talent = 0; let agent = 0;
      reportsOf(stats).forEach((report) => {
        const level = Number(report.audioLevel ?? 0);
        if (!Number.isFinite(level)) return;
        if (report.type === 'inbound-rtp' && (report.kind === 'audio' || report.mediaType === 'audio')) agent = Math.max(agent, level);
        if (report.type === 'media-source' || report.type === 'outbound-rtp') talent = Math.max(talent, level);
      });
      input.onAudioLevel?.({ talent: Math.min(1, talent * 3), agent: Math.min(1, agent * 3) });
    }).catch(() => undefined);
  }, 120);
  let closePromise: Promise<void> | undefined;
  return {
    sessionId: bootstrap.sessionId,
    close: () => {
      if (closePromise) return closePromise;
      closePromise = (async () => {
        // Release local audio immediately, even if the provider is unavailable.
        clearInterval(meter);
        stream.getTracks().forEach((track) => track.stop());
        peer.close();
        await broker(`/v1/kora/${bootstrap.sessionId}/end`, { method: 'POST' });
      })();
      return closePromise;
    },
  };
}
