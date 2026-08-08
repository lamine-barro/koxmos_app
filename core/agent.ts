import { getDeviceId } from './profile';
import type { EvaluationProgress, SkillAssessment, SkillLevel } from './passport';
import type { TutorKey } from './tutors';

export type AgentReply = { text: string; source: 'local-demo' | 'server'; proposal?: Omit<SkillAssessment, 'assessedAt' | 'tutor'> & { nextExercise?: string }; evaluation?: EvaluationProgress; wallet?: Wallet; chargedCredits?: number };
export type LearningMessage = { id: string; role: 'talent' | 'tuteur'; text: string; mode: 'text' | 'voice'; createdAt: string };
export type LearningSession = { id: string; skill: string; level: SkillLevel; tutor: string; summary: string; evaluation: EvaluationProgress; messages: LearningMessage[]; updatedAt: string };
export type Wallet = { balanceFcfa: number; balanceMilliXof: number; balanceCredits: number; creditSeconds: number; pricePerMinuteFcfa: number; textRequestCreditCost: number; updatedAt: string };
export type VoiceSession = { id: string; startedAt: string; pricePerMinuteFcfa: number; voiceConfigured: boolean };
export type AethexVoice = { id: string; name: string; language: string; gender?: string; country?: string; supportsDialectStyle?: boolean };
const endpoint = process.env.EXPO_PUBLIC_KOXMOS_AGENT_URL;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!endpoint) throw new Error('Configurez EXPO_PUBLIC_KOXMOS_AGENT_URL pour utiliser ce service.');
  const response = await fetch(`${endpoint.replace(/\/$/, '')}${path}`, { ...init, headers: { 'Content-Type': 'application/json', 'X-Koxmos-Device-Id': await getDeviceId(), ...(init.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Le service est indisponible.');
  return data as T;
}

export async function createLearningSession(input: { skill: string; level: SkillLevel; tutor: string }): Promise<LearningSession> { return (await request<{ session: LearningSession }>('/v1/learning/sessions', { method: 'POST', body: JSON.stringify(input) })).session; }
export async function startLearningEvaluation(id: string): Promise<LearningSession> { return (await request<{ session: LearningSession }>(`/v1/learning/${id}/evaluation`, { method: 'POST' })).session; }
export async function recordLearningEvent(id: string, event: { role: 'talent' | 'tuteur'; text: string; mode: 'text' | 'voice' }): Promise<LearningSession> { return (await request<{ session: LearningSession }>(`/v1/learning/${id}/events`, { method: 'POST', body: JSON.stringify(event) })).session; }
export async function askTextTutor(input: { firstName: string; country: string; tutorKey?: TutorKey; skill?: string; skillLevel?: SkillLevel; learningSessionId?: string; message: string }): Promise<AgentReply & { session?: LearningSession }> {
  if (endpoint) { const data = await request<{ text: string; proposal?: Omit<SkillAssessment, 'assessedAt' | 'tutor'> & { nextExercise?: string }; evaluation?: EvaluationProgress; session?: LearningSession; wallet?: Wallet; chargedCredits?: number }>('/v1/text', { method: 'POST', body: JSON.stringify(input) }); return { text: data.text, source: 'server', proposal: data.proposal, evaluation: data.evaluation, session: data.session, wallet: data.wallet, chargedCredits: data.chargedCredits }; }
  const focus = input.skill ? ` sur « ${input.skill} »` : '';
  return { source: 'local-demo', text: `Très bien, ${input.firstName}. Donne-moi un exemple réel${focus} : quel était le contexte, quelle décision as-tu prise et quel résultat as-tu obtenu ?` };
}

export async function assessSkill(skill: string, transcript: string): Promise<SkillAssessment> {
  const data = await request<{ level: SkillLevel; confidence: number; evidence: string; tutor: string }>('/v1/assessments', { method: 'POST', body: JSON.stringify({ skill, transcript }) });
  return { ...data, assessedAt: new Date().toISOString() };
}
export async function loadWallet(): Promise<Wallet> { return request<Wallet>('/v1/wallet'); }
export async function loadFlame(): Promise<number> { return (await request<{ flame: number }>('/v1/flame')).flame; }
export async function recordPractice(seconds: number): Promise<{ flame: number; rewarded: boolean }> { return request('/v1/practice', { method: 'POST', body: JSON.stringify({ seconds }) }); }
export async function requestRecharge(minutes: number): Promise<void> { await request('/v1/wallet/recharge', { method: 'POST', body: JSON.stringify({ minutes }) }); }
export async function addTestCredit(amountFcfa: number): Promise<Wallet> { return request<Wallet>('/v1/wallet/test-credit', { method: 'POST', body: JSON.stringify({ amountFcfa }) }); }
export async function startVoiceSession(skill: string): Promise<VoiceSession> { const data = await request<{ session: Omit<VoiceSession, 'voiceConfigured'>; voice: { configured: boolean } }>('/v1/sessions', { method: 'POST', body: JSON.stringify({ skill }) }); return { ...data.session, voiceConfigured: data.voice.configured }; }
export async function heartbeatVoiceSession(id: string): Promise<{ status: string; chargedFcfa: number; exhausted: boolean; wallet: Wallet }> { return request(`/v1/sessions/${id}/heartbeat`, { method: 'POST' }); }
export async function endVoiceSession(id: string): Promise<{ status: string; chargedFcfa: number; durationSeconds: number; wallet: Wallet }> { return request(`/v1/sessions/${id}/end`, { method: 'POST' }); }
export async function loadAethexVoices(country = 'CI'): Promise<AethexVoice[]> { return (await request<{ voices: AethexVoice[] }>(`/v1/kora/voices?country=${encodeURIComponent(country)}`)).voices; }
export async function deleteRemoteAccount(): Promise<void> { await request('/v1/account', { method: 'DELETE' }); }
