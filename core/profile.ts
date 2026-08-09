import { marketForCountry } from './markets';
import { clearLocalVault, readLocal, secureRandomHex, writeLocal } from './storage';

const PROFILE_KEY = 'koxmos.profile.v1';
const DEVICE_ID_KEY = 'koxmos.device-id.v1';
export const FIRST_NAME_MAX_LENGTH = 40;
export const COUNTRY_MAX_LENGTH = 8;

export type LocalProfile = {
  firstName: string;
  country: string;
  saveConversationHistory: boolean;
  createdAt: string;
};

export async function loadProfile(): Promise<LocalProfile | null> {
  const raw = await readLocal(PROFILE_KEY);
  if (!raw) return null;
  const profile = JSON.parse(raw) as Partial<LocalProfile>;
  return {
    firstName: profile.firstName ?? '',
    country: profile.country ?? 'CI',
    saveConversationHistory: profile.saveConversationHistory === true,
    createdAt: profile.createdAt ?? new Date().toISOString(),
  };
}

export async function saveProfile(firstName: string, country: string, preferences?: { saveConversationHistory?: boolean }): Promise<LocalProfile> {
  const normalizedFirstName = firstName.trim().replace(/\s+/g, ' ').slice(0, FIRST_NAME_MAX_LENGTH);
  const normalizedCountry = country.trim().toUpperCase().slice(0, COUNTRY_MAX_LENGTH);
  if (!normalizedFirstName) throw new Error('Le prénom est requis.');
  if (!/^[A-Z]{2,8}$/.test(normalizedCountry)) throw new Error('Le pays doit être un code de 2 à 8 lettres.');
  if (!marketForCountry(normalizedCountry)) throw new Error('Pays non pris en charge.');
  const current = await loadProfile();
  const profile: LocalProfile = { firstName: normalizedFirstName, country: normalizedCountry, saveConversationHistory: preferences?.saveConversationHistory ?? current?.saveConversationHistory ?? false, createdAt: current?.createdAt ?? new Date().toISOString() };
  if (!(await readLocal(DEVICE_ID_KEY))) {
    await writeLocal(DEVICE_ID_KEY, await secureRandomHex(32));
  }
  await writeLocal(PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

export async function getDeviceId(): Promise<string> {
  let deviceId = await readLocal(DEVICE_ID_KEY);
  if (!deviceId) { deviceId = await secureRandomHex(32); await writeLocal(DEVICE_ID_KEY, deviceId); }
  return deviceId;
}

// The device identifier is reset too: a newly created passport starts with a
// new local identity and cannot be linked to the previous anonymous session.
export async function deleteLocalPassport(): Promise<void> {
  await clearLocalVault([PROFILE_KEY, DEVICE_ID_KEY, 'koxmos.passport.skills.v2', 'koxmos.passport.skills.v1', 'koxmos.conversation-history.v1']);
}
