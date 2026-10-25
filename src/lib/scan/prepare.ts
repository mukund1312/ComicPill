// Shrink photos before sending them: a phone photo is many megabytes, and the
// model reads titles fine at ~1280px. Smaller uploads are faster AND cheaper,
// which matters because the reader pays for their own key.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export const MAX_SCAN_WIDTH = 1280;

/** Base64 JPEGs (no data: prefix). Photos that can't be processed are skipped. */
export async function prepareForScan(uris: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const uri of uris) {
    try {
      const ref = await ImageManipulator.manipulate(uri).resize({ width: MAX_SCAN_WIDTH }).renderAsync();
      const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.6, base64: true });
      if (saved.base64) out.push(saved.base64);
    } catch { /* one bad photo shouldn't sink the rest */ }
  }
  return out;
}
