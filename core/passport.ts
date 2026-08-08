import CryptoJS from 'crypto-js';
import { marketForCountry } from './markets';
import { readLocal, writeLocal } from './storage';

const SKILLS_KEY = 'koxmos.passport.skills.v2';
const LEGACY_SKILLS_KEY = 'koxmos.passport.skills.v1';
const EXPORT_ITERATIONS = 600_000;

export type SkillLevel = 'Débutant' | 'Intermédiaire' | 'Avancé' | 'Expert';
export type SkillSource = 'declared' | 'inferred';
export type SkillAssessment = { level: SkillLevel; previousLevel?: SkillLevel; evidence: string; confidence: number; assessedAt: string; tutor: string; nextExercise?: string };
export type Skill = { id: string; name: string; level: SkillLevel; source: SkillSource; isHidden: boolean; updatedAt: string; assessment?: SkillAssessment; assessmentHistory?: SkillAssessment[] };

const LEVELS: SkillLevel[] = ['Débutant', 'Intermédiaire', 'Avancé', 'Expert'];

// The installed development build has no native secure-random provider.
// This keeps local IDs and the temporary development export working; the
// signed release uses the platform secure store and native crypto modules.
function randomHex(bytes: number) {
  let value = '';
  for (let index = 0; index < bytes; index += 1) value += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
  return value;
}

function cleanSkill(value: unknown): Skill | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<Skill>;
  if (typeof item.id !== 'string' || typeof item.name !== 'string' || !LEVELS.includes(item.level as SkillLevel)) return null;
  const name = item.name.trim().slice(0, 80);
  if (!name) return null;
  const assessment = item.assessment && typeof item.assessment === 'object' ? item.assessment as SkillAssessment : undefined;
  const legacySource = (item as { source?: unknown }).source;
  const source: SkillSource = legacySource === 'inferred' || legacySource === 'Évaluée' ? 'inferred' : 'declared';
  const assessmentHistory = Array.isArray(item.assessmentHistory) ? item.assessmentHistory.filter((value): value is SkillAssessment => Boolean(value && typeof value === 'object')).slice(-12) : undefined;
  return { id: item.id, name, level: item.level as SkillLevel, source, isHidden: Boolean((item as { isHidden?: unknown; is_hidden?: unknown }).isHidden ?? (item as { is_hidden?: unknown }).is_hidden), updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(), assessment, assessmentHistory };
}

function parseSkills(raw: string | null): Skill[] {
  if (!raw) return [];
  try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed.map(cleanSkill).filter((item): item is Skill => Boolean(item)) : []; }
  catch { return []; }
}

export async function loadSkills(): Promise<Skill[]> {
  const current = await readLocal(SKILLS_KEY);
  if (current) return parseSkills(current);
  const legacy = await readLocal(LEGACY_SKILLS_KEY);
  const skills = parseSkills(legacy);
  if (skills.length) await save(skills);
  return skills;
}

async function save(skills: Skill[]) { await writeLocal(SKILLS_KEY, JSON.stringify(skills)); }

export async function addSkill(name: string): Promise<Skill[]> {
  const normalized = name.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!normalized) throw new Error('Saisissez une compétence valide.');
  const skills = await loadSkills();
  if (skills.some((skill) => skill.name.localeCompare(normalized, undefined, { sensitivity: 'accent' }) === 0)) throw new Error('Cette compétence est déjà dans votre passeport.');
  const skill: Skill = { id: randomHex(16), name: normalized, level: 'Débutant', source: 'declared', isHidden: false, updatedAt: new Date().toISOString() };
  const next = [skill, ...skills]; await save(next); return next;
}

export async function updateSkill(id: string, patch: Pick<Skill, 'name' | 'level'>): Promise<Skill[]> {
  const name = patch.name.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!name || !LEVELS.includes(patch.level)) throw new Error('Compétence ou niveau invalide.');
  const skills = await loadSkills();
  const exists = skills.some((skill) => skill.id !== id && skill.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0);
  if (exists) throw new Error('Cette compétence existe déjà.');
  const next = skills.map((skill) => skill.id === id ? { ...skill, name, level: patch.level, source: 'declared' as const, assessment: undefined, updatedAt: new Date().toISOString() } : skill);
  if (next.every((skill) => skill.id !== id)) throw new Error('Compétence introuvable.');
  await save(next); return next;
}

export async function applyAssessment(id: string, assessment: SkillAssessment): Promise<Skill[]> {
  if (!LEVELS.includes(assessment.level) || assessment.evidence.trim().length < 80 || assessment.confidence < 0.7 || assessment.confidence > 1) throw new Error('Évaluation insuffisamment étayée.');
  const skills = await loadSkills();
  const next = skills.map((skill) => {
    if (skill.id !== id) return skill;
    if (Math.abs(LEVELS.indexOf(assessment.level) - LEVELS.indexOf(skill.level)) > 1) throw new Error('Une évaluation ne peut faire évoluer qu’un niveau à la fois.');
    const reviewed = { ...assessment, previousLevel: skill.level, evidence: assessment.evidence.trim().slice(0, 800), nextExercise: assessment.nextExercise?.trim().slice(0, 400) };
    return { ...skill, level: assessment.level, source: 'inferred' as const, assessment: reviewed, assessmentHistory: [...(skill.assessmentHistory || []), reviewed].slice(-12), updatedAt: new Date().toISOString() };
  });
  if (next.every((skill) => skill.id !== id)) throw new Error('Compétence introuvable.');
  await save(next); return next;
}

// Used only for a broker-validated voice proposal. The talent has opted into
// automatic passport updates by using the Koxmos oral tutor.
export async function applyAgentAssessment(name: string, assessment: SkillAssessment): Promise<Skill[]> {
  const normalized = name.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!normalized) throw new Error('Compétence invalide.');
  const skills = await loadSkills();
  const existing = skills.find((skill) => skill.name.localeCompare(normalized, undefined, { sensitivity: 'accent' }) === 0);
  if (existing) return applyAssessment(existing.id, assessment);
  if (!LEVELS.includes(assessment.level) || assessment.confidence < 0.7 || assessment.evidence.trim().length < 80) throw new Error('Évaluation insuffisamment étayée.');
  const reviewed = { ...assessment, evidence: assessment.evidence.trim().slice(0, 800), nextExercise: assessment.nextExercise?.trim().slice(0, 400) };
  const skill: Skill = { id: randomHex(16), name: normalized, level: assessment.level, source: 'inferred', isHidden: false, assessment: reviewed, assessmentHistory: [reviewed], updatedAt: new Date().toISOString() };
  const next = [skill, ...skills]; await save(next); return next;
}

export async function removeSkill(id: string): Promise<Skill[]> { const next = (await loadSkills()).filter((skill) => skill.id !== id); await save(next); return next; }
export async function setSkillHidden(id: string, isHidden: boolean): Promise<Skill[]> {
  const skills = await loadSkills();
  const next = skills.map((skill) => skill.id === id ? { ...skill, isHidden, updatedAt: new Date().toISOString() } : skill);
  if (next.every((skill) => skill.id !== id)) throw new Error('Compétence introuvable.');
  await save(next); return next;
}
export function searchSkills(skills: Skill[], query: string, includeHidden = true): Skill[] {
  const normalized = query.trim().toLocaleLowerCase();
  return skills.filter((skill) => (includeHidden || !skill.isHidden) && (!normalized || skill.name.toLocaleLowerCase().includes(normalized)));
}

export async function createTransferCode(profile: { firstName: string; country: string }, skills: Skill[], passphrase: string): Promise<string> {
  if (passphrase.trim().length < 12) throw new Error('Choisissez une phrase secrète d’au moins 12 caractères.');
  const salt = randomHex(16);
  const material = CryptoJS.PBKDF2(passphrase, salt, { keySize: 512 / 32, iterations: EXPORT_ITERATIONS, hasher: CryptoJS.algo.SHA256 });
  const encryptionKey = CryptoJS.lib.WordArray.create(material.words.slice(0, 8), 32);
  const authenticationKey = CryptoJS.lib.WordArray.create(material.words.slice(8, 16), 32);
  const iv = randomHex(16);
  const payload = JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), profile, skills });
  const ciphertext = CryptoJS.AES.encrypt(payload, encryptionKey, { iv: CryptoJS.enc.Hex.parse(iv) }).ciphertext.toString(CryptoJS.enc.Base64);
  const mac = CryptoJS.HmacSHA256(`${salt}.${iv}.${ciphertext}`, authenticationKey).toString();
  return `KOXMOS3.${salt}.${iv}.${ciphertext}.${mac}`;
}

export async function importTransferCode(value: string, passphrase: string): Promise<{ profile: { firstName: string; country: string }; skills: Skill[] }> {
  const input = value.trim();
  if (!passphrase.trim()) throw new Error('Saisissez la phrase secrète de cet export.');
  let decrypted = '';
  if (input.startsWith('KOXMOS3.')) {
    const [, salt, iv, ciphertext, receivedMac] = input.split('.', 5);
    if (!salt || !iv || !ciphertext || !receivedMac) throw new Error('Ce passeport Koxmos est invalide.');
    const material = CryptoJS.PBKDF2(passphrase, salt, { keySize: 512 / 32, iterations: EXPORT_ITERATIONS, hasher: CryptoJS.algo.SHA256 });
    const encryptionKey = CryptoJS.lib.WordArray.create(material.words.slice(0, 8), 32);
    const authenticationKey = CryptoJS.lib.WordArray.create(material.words.slice(8, 16), 32);
    const expectedMac = CryptoJS.HmacSHA256(`${salt}.${iv}.${ciphertext}`, authenticationKey).toString();
    if (!constantTimeEqual(expectedMac, receivedMac)) throw new Error('La phrase secrète est incorrecte ou le passeport a été modifié.');
    decrypted = CryptoJS.AES.decrypt(CryptoJS.lib.CipherParams.create({ ciphertext: CryptoJS.enc.Base64.parse(ciphertext) }), encryptionKey, { iv: CryptoJS.enc.Hex.parse(iv) }).toString(CryptoJS.enc.Utf8);
  } else if (input.startsWith('KOXMOS2.')) {
    const [, salt, encrypted] = input.split('.', 3);
    if (!salt || !encrypted) throw new Error('Ce passeport Koxmos est invalide.');
    const key = CryptoJS.PBKDF2(passphrase, salt, { keySize: 256 / 32, iterations: 210000, hasher: CryptoJS.algo.SHA256 });
    decrypted = CryptoJS.AES.decrypt(encrypted, key).toString(CryptoJS.enc.Utf8);
  } else if (input.startsWith('KOXMOS1.')) decrypted = CryptoJS.AES.decrypt(input.slice('KOXMOS1.'.length), passphrase).toString(CryptoJS.enc.Utf8);
  else throw new Error('Ce code de passeport Koxmos est invalide.');
  if (!decrypted) throw new Error('La phrase secrète est incorrecte.');
  try {
    const parsed = JSON.parse(decrypted) as { profile?: { firstName?: string; country?: string }; skills?: unknown[] };
    if (!parsed.profile?.firstName || !parsed.profile.country || !Array.isArray(parsed.skills)) throw new Error('Ce passeport est incomplet.');
    const firstName = parsed.profile.firstName.trim().replace(/\s+/g, ' ').slice(0, 40);
    const country = parsed.profile.country.trim().toUpperCase().slice(0, 8);
    if (!firstName || !/^[A-Z]{2,8}$/.test(country) || !marketForCountry(country)) throw new Error('Ce passeport contient un profil invalide.');
    const skills = parsed.skills.map(cleanSkill).filter((item): item is Skill => Boolean(item));
    await save(skills); return { profile: { firstName, country }, skills };
  } catch (error) { if (error instanceof Error && ['Ce passeport est incomplet.', 'Ce passeport contient un profil invalide.'].includes(error.message)) throw error; throw new Error('Ce passeport est illisible.'); }
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
