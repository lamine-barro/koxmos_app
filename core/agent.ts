import { getDeviceId } from './profile';
import { fetch as expoFetch } from 'expo/fetch';
import { AgentRequestError } from './errors';
import { debugError, debugLog, newTraceId } from './debug';
import type { EvaluationProgress, SkillAssessment, SkillLevel } from './passport';
import type { TutorKey } from './tutors';

export type AgentReply = { text: string; source: 'server'; proposal?: Omit<SkillAssessment, 'assessedAt' | 'tutor'> & { nextExercise?: string }; evaluation?: EvaluationProgress; wallet?: Wallet; chargedCredits?: number };
export type LearningMessage = { id: string; role: 'talent' | 'tuteur'; text: string; mode: 'text' | 'voice'; createdAt: string };
export type LearningSession = { id: string; skill: string; level: SkillLevel; tutor: string; summary: string; evaluation: EvaluationProgress; messages: LearningMessage[]; updatedAt: string };
export type Wallet = { balanceFcfa: number; balanceMilliXof: number; balanceCredits: number; creditSeconds: number; pricePerMinuteFcfa: number; textRequestCreditCost: number; updatedAt: string };
export type VoiceSession = { id: string; startedAt: string; pricePerMinuteFcfa: number; voiceConfigured: boolean };
export type TextTutorStreamEvent = { type: 'delta'; delta: string } | { type: 'done'; text: string; proposal?: AgentReply['proposal']; evaluation?: EvaluationProgress; session?: LearningSession; wallet?: Wallet; chargedCredits?: number };
const endpoint = process.env.EXPO_PUBLIC_KOXMOS_AGENT_URL;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!endpoint) throw new Error('Configurez EXPO_PUBLIC_KOXMOS_AGENT_URL pour utiliser ce service.');
  const traceId = newTraceId('http'); const startedAt = Date.now();
  debugLog('http.request', { traceId, path, method: init.method || 'GET' });
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, '')}${path}`, { ...init, headers: { 'Content-Type': 'application/json', 'X-Koxmos-Trace-Id': traceId, 'X-Koxmos-Device-Id': await getDeviceId(), ...(init.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    debugLog('http.response', { traceId, path, status: response.status, durationMs: Date.now() - startedAt });
    if (!response.ok) throw new AgentRequestError(data.error || 'Le service est indisponible.', response.status);
    return data as T;
  } catch (error) { debugError('http.error', error, { traceId, path, durationMs: Date.now() - startedAt }); throw error; }
}

export async function createLearningSession(input: { skill: string; level: SkillLevel; tutor: string }): Promise<LearningSession> { return (await request<{ session: LearningSession }>('/v1/learning/sessions', { method: 'POST', body: JSON.stringify(input) })).session; }
export async function startLearningEvaluation(id: string): Promise<LearningSession> { return (await request<{ session: LearningSession }>(`/v1/learning/${id}/evaluation`, { method: 'POST' })).session; }
export async function streamTextTutor(input: { firstName: string; country: string; tutorKey?: TutorKey; skill?: string; skillLevel?: SkillLevel; learningSessionId?: string; clientContext?: string; message: string }, onEvent: (event: TextTutorStreamEvent) => void, signal?: AbortSignal): Promise<void> {
  if (!endpoint) throw new Error('Configurez EXPO_PUBLIC_KOXMOS_AGENT_URL pour utiliser le tuteur.');
  const url = `${endpoint.replace(/\/$/, '')}/v1/text`;
  const deviceId = await getDeviceId();
  const transportFetch = typeof navigator !== 'undefined' && navigator.product === 'ReactNative' ? expoFetch : fetch;
  const traceId = newTraceId('text'); const startedAt = Date.now(); let chunks = 0; let firstDeltaAt = 0;
  debugLog('text.stream.start', { traceId, learningSessionId: input.learningSessionId, tutor: input.tutorKey, skill: input.skill, messageChars: input.message.length, contextChars: input.clientContext?.length || 0 });
  let response: Response;
  try { response = await transportFetch(url, { method: 'POST', signal, headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json', 'X-Koxmos-Trace-Id': traceId, 'X-Koxmos-Device-Id': deviceId }, body: JSON.stringify(input) }); }
  catch (error) { debugError('text.stream.connection_error', error, { traceId, durationMs: Date.now() - startedAt }); throw error; }
  if (!response.ok) { const data = await response.json().catch(() => ({})); debugLog('text.stream.rejected', { traceId, status: response.status, durationMs: Date.now() - startedAt }); throw new AgentRequestError(data.error || 'Le service est indisponible.', response.status); }
  const emitFrames = (source: string) => {
    for (const frame of source.split(/\n\n/)) {
      const payload = frame.split(/\r?\n/).find((line) => line.startsWith('data: '))?.slice(6);
      if (!payload) continue;
      const event = JSON.parse(payload) as TextTutorStreamEvent;
      if (event.type === 'delta') { chunks += 1; if (!firstDeltaAt) firstDeltaAt = Date.now(); }
      if (event.type === 'done') debugLog('text.stream.done', { traceId, chunks, responseChars: event.text.length, ttftMs: firstDeltaAt ? firstDeltaAt - startedAt : undefined, durationMs: Date.now() - startedAt, chargedCredits: event.chargedCredits, evaluation: event.evaluation, proposal: event.proposal?.level });
      onEvent(event);
    }
  };
  if (!response.body) throw new Error('Le streaming du tuteur est indisponible sur cet appareil.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try { for (;;) {
      const next = await reader.read();
      if (next.done) break;
      buffer += decoder.decode(next.value, { stream: true });
      const frames = buffer.split(/\n\n/);
      buffer = frames.pop() || '';
      emitFrames(frames.join('\n\n'));
    }
  } catch (error) { debugError('text.stream.read_error', error, { traceId, chunks, durationMs: Date.now() - startedAt }); throw error; }
}

export async function loadWallet(): Promise<Wallet> { return request<Wallet>('/v1/wallet'); }
export async function loadFlame(): Promise<number> { return (await request<{ flame: number }>('/v1/flame')).flame; }
export async function recordPractice(seconds: number): Promise<{ flame: number; rewarded: boolean }> { return request('/v1/practice', { method: 'POST', body: JSON.stringify({ seconds }) }); }
export async function requestRecharge(minutes: number): Promise<void> { await request('/v1/wallet/recharge', { method: 'POST', body: JSON.stringify({ minutes }) }); }
export async function addTestCredit(amountFcfa: number): Promise<Wallet> { return request<Wallet>('/v1/wallet/test-credit', { method: 'POST', body: JSON.stringify({ amountFcfa }) }); }
export async function startVoiceSession(skill: string): Promise<VoiceSession> { const data = await request<{ session: Omit<VoiceSession, 'voiceConfigured'>; voice: { configured: boolean } }>('/v1/sessions', { method: 'POST', body: JSON.stringify({ skill }) }); return { ...data.session, voiceConfigured: data.voice.configured }; }
export async function heartbeatVoiceSession(id: string): Promise<{ status: string; chargedFcfa: number; exhausted: boolean; wallet: Wallet }> { return request(`/v1/sessions/${id}/heartbeat`, { method: 'POST' }); }
export async function endVoiceSession(id: string): Promise<{ status: string; chargedFcfa: number; durationSeconds: number; wallet: Wallet }> { return request(`/v1/sessions/${id}/end`, { method: 'POST' }); }
export async function deleteRemoteAccount(): Promise<void> { await request('/v1/account', { method: 'DELETE' }); }
