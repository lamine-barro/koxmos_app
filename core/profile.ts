import { marketForCountry } from './markets';
import { readLocal, writeLocal } from './storage';

const PROFILE_KEY = 'koxmos.profile.v1';
const DEVICE_ID_KEY = 'koxmos.device-id.v1';
export const FIRST_NAME_MAX_LENGTH = 40;
export const COUNTRY_MAX_LENGTH = 8;

export type LocalProfile = {
  firstName: string;
  country: string;
  createdAt: string;
};

function makeDeviceId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export async function loadProfile(): Promise<LocalProfile | null> {
  const raw = await readLocal(PROFILE_KEY);
  if (!raw) return null;
  const profile = JSON.parse(raw) as Partial<LocalProfile>;
  return {
    firstName: profile.firstName ?? '',
    country: profile.country ?? 'CI',
    createdAt: profile.createdAt ?? new Date().toISOString(),
  };
}

export async function saveProfile(firstName: string, country: string): Promise<LocalProfile> {
  const normalizedFirstName = firstName.trim().replace(/\s+/g, ' ').slice(0, FIRST_NAME_MAX_LENGTH);
  const normalizedCountry = country.trim().toUpperCase().slice(0, COUNTRY_MAX_LENGTH);
  if (!normalizedFirstName) throw new Error('Le prénom est requis.');
  if (!/^[A-Z]{2,8}$/.test(normalizedCountry)) throw new Error('Le pays doit être un code de 2 à 8 lettres.');
  if (!marketForCountry(normalizedCountry)) throw new Error('Pays non pris en charge.');
  const profile: LocalProfile = { firstName: normalizedFirstName, country: normalizedCountry, createdAt: new Date().toISOString() };
  if (!(await readLocal(DEVICE_ID_KEY))) {
    await writeLocal(DEVICE_ID_KEY, makeDeviceId());
  }
  await writeLocal(PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

export async function getDeviceId(): Promise<string> {
  let deviceId = await readLocal(DEVICE_ID_KEY);
  if (!deviceId) { deviceId = makeDeviceId(); await writeLocal(DEVICE_ID_KEY, deviceId); }
  return deviceId;
}

// The device identifier is reset too: a newly created passport starts with a
// new local identity and cannot be linked to the previous anonymous session.
export async function deleteLocalPassport(): Promise<void> {
  await Promise.all([
    writeLocal(PROFILE_KEY, ''),
    writeLocal(DEVICE_ID_KEY, ''),
    writeLocal('koxmos.passport.skills.v2', ''),
    writeLocal('koxmos.passport.skills.v1', ''),
  ]);
}
