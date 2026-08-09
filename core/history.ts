import { readLocal, writeLocal } from './storage';

const HISTORY_KEY = 'koxmos.conversation-history.v1';
const MAX_CONVERSATIONS = 40;
const MAX_MESSAGES_PER_CONVERSATION = 80;

export type ConversationHistoryMessage = { role: 'talent' | 'tuteur'; text: string };
export type ConversationHistory = { id: string; tutor: string; skill: string; updatedAt: string; messages: ConversationHistoryMessage[] };

function parse(raw: string | null): ConversationHistory[] {
  if (!raw) return [];
  try {
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return [];
    return items.filter((item): item is ConversationHistory => Boolean(item && typeof item.id === 'string' && typeof item.tutor === 'string' && typeof item.skill === 'string' && typeof item.updatedAt === 'string' && Array.isArray(item.messages))).map((item) => ({ ...item, messages: item.messages.filter((message) => message && (message.role === 'talent' || message.role === 'tuteur') && typeof message.text === 'string').map((message) => ({ role: message.role, text: message.text.slice(0, 4000) })).slice(-MAX_MESSAGES_PER_CONVERSATION) })).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch { return []; }
}

async function save(items: ConversationHistory[]) { await writeLocal(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_CONVERSATIONS))); }

export async function loadConversationHistory() { return parse(await readLocal(HISTORY_KEY)); }

export async function saveConversationHistory(item: ConversationHistory) {
  const messages = item.messages.filter((message) => message.text.trim()).slice(-MAX_MESSAGES_PER_CONVERSATION).map((message) => ({ role: message.role, text: message.text.trim().slice(0, 4000) }));
  if (!messages.length) return;
  const items = await loadConversationHistory();
  const next = [{ ...item, tutor: item.tutor.slice(0, 80), skill: item.skill.slice(0, 80), updatedAt: new Date().toISOString(), messages }, ...items.filter((entry) => entry.id !== item.id)];
  await save(next);
}

export async function deleteConversationHistory(id: string) { await save((await loadConversationHistory()).filter((item) => item.id !== id)); }
export async function clearConversationHistory() { await writeLocal(HISTORY_KEY, ''); }
