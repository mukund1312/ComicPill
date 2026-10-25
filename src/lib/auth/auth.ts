import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { createAuthStore } from './store';

const bytesToHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** The app's sign-in state. Credentials live in the phone's secure storage. */
export const useAuth = createAuthStore({
  vault: {
    get: (k) => SecureStore.getItemAsync(k),
    set: (k, v) => SecureStore.setItemAsync(k, v),
    remove: (k) => SecureStore.deleteItemAsync(k),
  },
  hash: (salt, pw) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pw}`),
  salt: () => bytesToHex(Crypto.getRandomBytes(16)),
  now: () => new Date(),
});
