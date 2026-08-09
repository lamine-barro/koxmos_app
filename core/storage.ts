import AsyncStorage from '@react-native-async-storage/async-storage';
import CryptoJS from 'crypto-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Settings } from 'react-native';

const MASTER_KEY = 'koxmos.local-vault-key.v1';
const ENVELOPE_PREFIX = 'KOXMOS_LOCAL_V1';
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'com.koxmos.os.local-vault',
};

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function secureRandomHex(bytes: number) {
  return bytesToHex(await Crypto.getRandomBytesAsync(bytes));
}

async function masterMaterial() {
  if (!(await SecureStore.isAvailableAsync())) throw new Error('Le stockage sécurisé de cet appareil est indisponible.');
  let material = await SecureStore.getItemAsync(MASTER_KEY, secureStoreOptions);
  if (!material) {
    material = await secureRandomHex(64);
    await SecureStore.setItemAsync(MASTER_KEY, material, secureStoreOptions);
  }
  if (!/^[a-f0-9]{128}$/i.test(material)) throw new Error('La clé locale Koxmos est invalide.');
  return {
    encryptionKey: CryptoJS.enc.Hex.parse(material.slice(0, 64)),
    authenticationKey: CryptoJS.enc.Hex.parse(material.slice(64)),
  };
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function encrypt(value: string) {
  const { encryptionKey, authenticationKey } = await masterMaterial();
  const iv = await secureRandomHex(16);
  const ciphertext = CryptoJS.AES.encrypt(value, encryptionKey, { iv: CryptoJS.enc.Hex.parse(iv) }).ciphertext.toString(CryptoJS.enc.Base64);
  const mac = CryptoJS.HmacSHA256(`${iv}.${ciphertext}`, authenticationKey).toString();
  return `${ENVELOPE_PREFIX}.${iv}.${ciphertext}.${mac}`;
}

async function decrypt(value: string) {
  const [prefix, iv, ciphertext, receivedMac] = value.split('.', 4);
  if (prefix !== ENVELOPE_PREFIX || !iv || !ciphertext || !receivedMac) throw new Error('Donnée locale Koxmos illisible.');
  const { encryptionKey, authenticationKey } = await masterMaterial();
  const expectedMac = CryptoJS.HmacSHA256(`${iv}.${ciphertext}`, authenticationKey).toString();
  if (!constantTimeEqual(expectedMac, receivedMac)) throw new Error('Donnée locale Koxmos altérée.');
  return CryptoJS.AES.decrypt(CryptoJS.lib.CipherParams.create({ ciphertext: CryptoJS.enc.Base64.parse(ciphertext) }), encryptionKey, { iv: CryptoJS.enc.Hex.parse(iv) }).toString(CryptoJS.enc.Utf8);
}

/** Reads an encrypted value and migrates the former plaintext Settings entry once. */
export async function readLocal(key: string): Promise<string | null> {
  const persisted = await AsyncStorage.getItem(key);
  if (persisted) return decrypt(persisted);
  const legacy = Settings.get(key);
  if (typeof legacy !== 'string' || !legacy) return null;
  await writeLocal(key, legacy);
  Settings.set({ [key]: '' });
  return legacy;
}

export async function writeLocal(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, await encrypt(value));
  Settings.set({ [key]: '' });
}

/** Destroys both ciphertexts and the device-bound key used to decrypt them. */
export async function clearLocalVault(keys: string[]): Promise<void> {
  await AsyncStorage.multiRemove(keys);
  Settings.set(Object.fromEntries(keys.map((key) => [key, ''])));
  await SecureStore.deleteItemAsync(MASTER_KEY, secureStoreOptions);
}
