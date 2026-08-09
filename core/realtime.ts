import { getDeviceId } from './profile';
import { NativeModules } from 'react-native';
import { AgentRequestError } from './errors';

type MediaStream = import('react-native-webrtc').MediaStream;
const endpoint = process.env.EXPO_PUBLIC_KOXMOS_AGENT_URL;
export type LiveTranscript = { speaker: 'talent' | 'agent'; text: string; isFinal?: boolean };
export type RealtimeCloseResult = { proposal?: { level: 'Débutant' | 'Intermédiaire' | 'Avancé' | 'Expert'; confidence: number; evidence: string; nextExercise?: string }; evaluation?: { active: boolean; questionCount: number; consecutiveSuccesses: number; completed: boolean; passed: boolean } };

async function broker<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!endpoint) throw new Error('Configurez EXPO_PUBLIC_KOXMOS_AGENT_URL.');
  const response = await fetch(`${endpoint.replace(/\/$/, '')}${path}`, { ...init, headers: { 'Content-Type': 'application/json', 'X-Koxmos-Device-Id': await getDeviceId(), ...(init.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new AgentRequestError(data.error || 'OpenAI Realtime est indisponible.', response.status);
  return data as T;
}
function asText(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
function reportsOf(stats: unknown) { return stats instanceof Map ? [...stats.values()] as Record<string, unknown>[] : Array.isArray(stats) ? stats as Record<string, unknown>[] : Object.values(stats as Record<string, Record<string, unknown>>); }

export async function startRealtimeConversation(input: { billingSessionId: string; learningSessionId?: string; country?: string; level: string; summary?: string; tutor?: string; resume?: boolean; onRemoteStream: (stream: MediaStream) => void; onStatus: (status: string) => void; onAudioLevel?: (levels: { talent: number; agent: number }) => void; onTranscript?: (turn: LiveTranscript) => void; onLimit?: () => void }) {
  if (!NativeModules.WebRTCModule && !NativeModules.RTCModule) throw new Error('La fonction vocale nécessite une version récente de Koxmos sur ce téléphone.');
  const { mediaDevices, RTCPeerConnection, RTCSessionDescription } = require('react-native-webrtc') as typeof import('react-native-webrtc');
  const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
  const peer = new RTCPeerConnection();
  stream.getTracks().forEach((track) => peer.addTrack(track, stream));
  peer.ontrack = (event: any) => { if (event.streams[0]) input.onRemoteStream(event.streams[0]); };
  peer.onconnectionstatechange = () => input.onStatus(peer.connectionState);
  const channel = peer.createDataChannel('oai-events', { ordered: true });
  let closing = false;
  channel.onmessage = (message: any) => {
    try {
      const event = JSON.parse(String(message.data || '')) as Record<string, any>;
      const type = asText(event.type);
      if (type === 'conversation.item.input_audio_transcription.delta' || type === 'conversation.item.input_audio_transcription.completed') {
        const text = asText(event.delta) || asText(event.transcript); if (text) input.onTranscript?.({ speaker: 'talent', text, isFinal: type.endsWith('completed') }); return;
      }
      if (type === 'response.output_audio_transcript.delta' || type === 'response.output_audio_transcript.done') {
        const text = asText(event.delta) || asText(event.transcript); if (text) input.onTranscript?.({ speaker: 'agent', text, isFinal: type.endsWith('done') }); return;
      }
      // Tools, transcript persistence, and usage accounting run on Koxmos's
      // server-side Realtime control channel. The phone only renders audio and
      // transcript events, so it cannot forge a tool result or token record.
    } catch { /* Ignore malformed provider events without breaking audio. */ }
  };
  const offer = await peer.createOffer({ offerToReceiveAudio: true }); await peer.setLocalDescription(offer);
  let connection: { sdp: string; maxDurationSeconds: number };
  try {
    connection = await broker('/v1/realtime/connect', { method: 'POST', body: JSON.stringify({ billingSessionId: input.billingSessionId, learningSessionId: input.learningSessionId, country: input.country, level: input.level, summary: input.summary, tutor: input.tutor, resume: input.resume === true, sdp: offer.sdp || '' }) });
  } catch (error) { stream.getTracks().forEach((track) => track.stop()); peer.close(); throw error; }
  await peer.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: connection.sdp }));
  const meter = setInterval(() => { void peer.getStats().then((stats: unknown) => { let talent = 0; let agent = 0; reportsOf(stats).forEach((report) => { const level = Number(report.audioLevel ?? 0); if (!Number.isFinite(level)) return; if (report.type === 'inbound-rtp' && (report.kind === 'audio' || report.mediaType === 'audio')) agent = Math.max(agent, level); if (report.type === 'media-source' || report.type === 'outbound-rtp') talent = Math.max(talent, level); }); input.onAudioLevel?.({ talent: Math.min(1, talent * 3), agent: Math.min(1, agent * 3) }); }).catch(() => undefined); }, 120);
  const limit = setTimeout(() => { if (!closing) void close().catch(() => undefined).finally(() => input.onLimit?.()); }, connection.maxDurationSeconds * 1000);
  let closePromise: Promise<RealtimeCloseResult> | undefined;
  const close = () => {
    if (closePromise) return closePromise;
    closing = true;
    closePromise = (async () => { clearTimeout(limit); clearInterval(meter); stream.getTracks().forEach((track) => track.stop()); channel.close(); peer.close(); return broker<RealtimeCloseResult>(`/v1/realtime/${input.billingSessionId}/end`, { method: 'POST' }); })();
    return closePromise;
  };
  return { sessionId: input.billingSessionId, close };
}
