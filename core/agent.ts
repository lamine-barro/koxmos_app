import { getDeviceId } from './profile';
import type { EvaluationProgress, SkillAssessment, SkillLevel } from './passport';
import type { TutorKey } from './tutors';
import { readLocal, writeLocal } from './storage';

export type AgentReply = { text: string; source: 'local-demo' | 'server'; proposal?: Omit<SkillAssessment, 'assessedAt' | 'tutor'> & { nextExercise?: string }; evaluation?: EvaluationProgress; wallet?: Wallet; chargedCredits?: number };
export type Wallet = { balanceFcfa: number; balanceMilliXof: number; balanceCredits: number; creditSeconds: number; pricePerMinuteFcfa: number; textRequestCreditCost: number; updatedAt: string };
export type VoiceSession = { id: string; startedAt: string; pricePerMinuteFcfa: number; voiceConfigured: boolean };
export type AethexVoice = { id: string; name: string; language: string; gender?: string; country?: string; supportsDialectStyle?: boolean };
const endpoint = process.env.EXPO_PUBLIC_KOXMOS_AGENT_URL;
const LOCAL_WALLET_KEY = 'koxmos.wallet.v1';
const DEFAULT_WALLET: Wallet = { balanceFcfa: 1000, balanceMilliXof: 1_000_000, balanceCredits: 10, creditSeconds: 600, pricePerMinuteFcfa: 100, textRequestCreditCost: .25, updatedAt: new Date().toISOString() };

async function localWallet(): Promise<Wallet> {
  const raw = await readLocal(LOCAL_WALLET_KEY);
  if (!raw) { await writeLocal(LOCAL_WALLET_KEY, JSON.stringify(DEFAULT_WALLET)); return DEFAULT_WALLET; }
  try { return { ...DEFAULT_WALLET, ...(JSON.parse(raw) as Partial<Wallet>) }; } catch { return DEFAULT_WALLET; }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!endpoint) throw new Error('Configurez EXPO_PUBLIC_KOXMOS_AGENT_URL pour utiliser ce service.');
  const response = await fetch(`${endpoint.replace(/\/$/, '')}${path}`, { ...init, headers: { 'Content-Type': 'application/json', 'X-Koxmos-Device-Id': await getDeviceId(), ...(init.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Le service est indisponible.');
  return data as T;
}

export async function askTextTutor(input: { firstName: string; country: string; tutorKey?: TutorKey; skill?: string; skillLevel?: SkillLevel; evaluation?: EvaluationProgress; message: string }): Promise<AgentReply> {
  if (endpoint) { const data = await request<{ text: string; proposal?: Omit<SkillAssessment, 'assessedAt' | 'tutor'> & { nextExercise?: string }; evaluation?: EvaluationProgress; wallet?: Wallet; chargedCredits?: number }>('/v1/text', { method: 'POST', body: JSON.stringify(input) }); return { text: data.text, source: 'server', proposal: data.proposal, evaluation: data.evaluation, wallet: data.wallet, chargedCredits: data.chargedCredits }; }
  const focus = input.skill ? ` sur « ${input.skill} »` : '';
  return { source: 'local-demo', text: `Très bien, ${input.firstName}. Donne-moi un exemple réel${focus} : quel était le contexte, quelle décision as-tu prise et quel résultat as-tu obtenu ?` };
}

export async function assessSkill(skill: string, transcript: string): Promise<SkillAssessment> {
  const data = await request<{ level: SkillLevel; confidence: number; evidence: string; tutor: string }>('/v1/assessments', { method: 'POST', body: JSON.stringify({ skill, transcript }) });
  return { ...data, assessedAt: new Date().toISOString() };
}
export async function loadWallet(): Promise<Wallet> {
  try {
    if (endpoint) return await request<Wallet>('/v1/wallet');
  } catch {
    // The phone keeps a usable session while the broker is unavailable.
  }
  return localWallet();
}
export async function loadFlame(): Promise<number> { return (await request<{ flame: number }>('/v1/flame')).flame; }
export async function recordPractice(seconds: number): Promise<{ flame: number; rewarded: boolean }> { return request('/v1/practice', { method: 'POST', body: JSON.stringify({ seconds }) }); }
export async function requestRecharge(minutes: number): Promise<void> { await request('/v1/wallet/recharge', { method: 'POST', body: JSON.stringify({ minutes }) }); }
export async function addTestCredit(amountFcfa: number): Promise<Wallet> { return request<Wallet>('/v1/wallet/test-credit', { method: 'POST', body: JSON.stringify({ amountFcfa }) }); }
export async function startVoiceSession(skill: string): Promise<VoiceSession> { const data = await request<{ session: Omit<VoiceSession, 'voiceConfigured'>; voice: { configured: boolean } }>('/v1/sessions', { method: 'POST', body: JSON.stringify({ skill }) }); return { ...data.session, voiceConfigured: data.voice.configured }; }
export async function heartbeatVoiceSession(id: string): Promise<{ status: string; chargedFcfa: number; exhausted: boolean; wallet: Wallet }> { return request(`/v1/sessions/${id}/heartbeat`, { method: 'POST' }); }
export async function endVoiceSession(id: string): Promise<{ status: string; chargedFcfa: number; durationSeconds: number; wallet: Wallet }> { return request(`/v1/sessions/${id}/end`, { method: 'POST' }); }
export async function loadAethexVoices(country = 'CI'): Promise<AethexVoice[]> { return (await request<{ voices: AethexVoice[] }>(`/v1/kora/voices?country=${encodeURIComponent(country)}`)).voices; }
export async function deleteRemoteAccount(): Promise<void> { await request('/v1/account', { method: 'DELETE' }); }
