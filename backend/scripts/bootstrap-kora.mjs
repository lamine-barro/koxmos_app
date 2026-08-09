import { AethexAI } from 'aethexai';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(import.meta.dirname, '../.env');
if (existsSync(envFile)) for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) { const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, ''); }

const apiKey = process.env.AETHEX_API_KEY;
const toolUrl = process.env.KOXMOS_KORA_TOOL_URL;
const toolSecret = process.env.KOXMOS_KORA_TOOL_SECRET;
if (!apiKey || !toolUrl || !toolSecret) throw new Error('AETHEX_API_KEY, KOXMOS_KORA_TOOL_URL et KOXMOS_KORA_TOOL_SECRET sont requis.');

const client = new AethexAI({ apiKey });
const voices = Array.from(await client.listVoices({ limit: 100 }));
const existingAgents = Array.from(await client.listAgents({ limit: 100 }));
const tutors = [
  { key: 'ADJOUA', name: 'Koxmos — Adjoua', language: 'french', voice: 'Adjoua' },
  { key: 'KOUADIO', name: 'Koxmos — Kouadio', language: 'french', voice: 'Kouadio' },
  { key: 'KAMAU', name: 'Kamau · Business', language: 'english', voice: 'Kamau' },
  { key: 'NANA', name: 'Nana · Digital skills', language: 'english', voice: 'Nana' },
];

function voicePrompt(tutor) {
  const language = tutor.language === 'french' ? 'français' : 'anglais';
  return `Tu es ${tutor.name}, tuteur vocal Koxmos. Parle uniquement en ${language}. Au début de chaque séance, appelle get_talent_skill_context et travaille exclusivement la compétence et le niveau renvoyés.

Ton expérience doit être cohérente avec le tuteur texte : fais progresser la personne à partir d'une situation réelle, donne une action courte, explique brièvement le raisonnement, définis un résultat mesurable et termine par une seule prochaine action ou question. À l'oral, reste concis : une à trois idées à la fois, phrases simples, pauses naturelles. N'énumère pas mécaniquement les rubriques ; adapte-les à la demande.

Cette conversation vocale est en direct et n'est pas enregistrée par l'application. Propose des exercices oraux pendant la séance, mais ne demande aucun envoi audio, vidéo ou fichier. Ne prétends jamais avoir modifié le passeport.

Si une évaluation en cinq questions est active, appelle record_assessment_answer après chaque réponse. N'appelle propose_passport_update qu'après cinq réussites consécutives confirmées. La proposition exige une confiance d'au moins 0,70, des preuves détaillées et un écart maximal d'un niveau.`;
}

for (const tutor of tutors) {
  const voice = voices.find((item) => item.name.toLowerCase() === tutor.voice.toLowerCase() && item.language === tutor.language);
  if (!voice) { console.warn(`Voix introuvable : ${tutor.voice} (${tutor.language})`); continue; }
  const firstMessage = tutor.language === 'french' ? 'Bonjour. Sur quelle situation concrète souhaitez-vous travailler ?' : 'Hello. What real situation would you like to work on today?';
  const config = { name: tutor.name, voice_id: voice.id, language: tutor.language, recording_enabled: false, transcription_enabled: true, content_guardrail_enabled: true, focus_guardrail_enabled: true, first_message: firstMessage, system_prompt: voicePrompt(tutor) };
  const existing = existingAgents.find((item) => item.name === tutor.name);
  const agent = existing ? await client.updateAgent(existing.id, config) : await client.createAgent(config);
  const existingTools = Array.from(await client.listAgentTools(agent.id));
  for (const definition of [
    { name: 'get_talent_skill_context', description: 'Obtient le contexte minimal de compétence du talent pour cette conversation.', parameters_schema: { type: 'object', properties: {} } },
    { name: 'record_assessment_answer', description: 'Enregistre une réponse dans une évaluation active.', parameters_schema: { type: 'object', properties: { success: { type: 'boolean' }, explanation: { type: 'string', minLength: 30, maxLength: 600 } }, required: ['success', 'explanation'] } },
    { name: 'propose_passport_update', description: 'Propose, sans appliquer, une mise à jour du niveau après des preuves observées.', parameters_schema: { type: 'object', properties: { level: { type: 'string', enum: ['Débutant', 'Intermédiaire', 'Avancé', 'Expert'] }, confidence: { type: 'number', minimum: 0, maximum: 1 }, evidence: { type: 'string', minLength: 20, maxLength: 800 }, next_exercise: { type: 'string', minLength: 10, maxLength: 400 } }, required: ['level', 'confidence', 'evidence', 'next_exercise'] } },
  ]) if (!existingTools.some((item) => item.name === definition.name)) await client.addAgentTool(agent.id, { ...definition, endpoint_url: toolUrl, headers: { 'X-Koxmos-Kora-Secret': toolSecret } });
  console.log(`AETHEX_TUTOR_${tutor.key}_AGENT_ID=${agent.id}`);
}
