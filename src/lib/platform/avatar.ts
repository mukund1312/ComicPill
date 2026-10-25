// Turn a picked photo into a small square JPEG data URI that is cheap to keep
// in local storage (a raw phone photo can be many megabytes).
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export const AVATAR_SIZE = 256;

export async function toAvatarDataUri(uri: string): Promise<string> {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: AVATAR_SIZE }).renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!out.base64) throw new Error('No image data was produced.');
  return `data:image/jpeg;base64,${out.base64}`;
}
