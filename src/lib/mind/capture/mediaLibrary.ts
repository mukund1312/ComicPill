// expo-media-library's native half is not inside Expo Go, and importing it there throws. Everything that
// touches the gallery goes through here, so Expo Go simply reports "not available" instead of crashing at startup.
type ML = typeof import('expo-media-library');

let cached: ML | null | undefined;

export function getMediaLibrary(): ML | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-media-library') as ML;
  } catch {
    cached = null;
  }
  return cached;
}

export const galleryAvailable = () => getMediaLibrary() !== null;
