import * as Crypto from 'expo-crypto';
import type { Sha256 } from './lock';

export const sha256: Sha256 = (text) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
export const newSalt = (): string => Crypto.randomUUID();
