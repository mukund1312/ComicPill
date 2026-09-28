import * as Crypto from 'expo-crypto';

/** A UUID for locally-created rows (events, shown, not_tonight, ...). Not an
 *  engine — this file may use randomness and the system clock freely. */
export function newId(): string {
  return Crypto.randomUUID();
}
