import { Settings } from 'react-native';

// This development build predates ExpoSecureStore. UserDefaults, exposed by
// React Native Settings on iOS, keeps the phone session across restarts until
// the signed app restores secure persistent storage.
const fallback = new Map<string, string>();

export async function readLocal(key: string): Promise<string | null> {
  const persisted = Settings.get(key);
  if (typeof persisted === 'string') return persisted;
  return fallback.get(key) ?? null;
}

export async function writeLocal(key: string, value: string): Promise<void> {
  fallback.set(key, value);
  Settings.set({ [key]: value });
}
