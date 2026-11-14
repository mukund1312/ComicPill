// Screenshots come in only when the reader picks them: the phone's own photo picker shows its own screen and hands back just the images
// chosen, so ComicPill needs no gallery permission and never lists the gallery. Each pick is copied into the app's private storage.
import * as ImagePicker from 'expo-image-picker';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import type { MindStore } from '../store';

const MAX_PICK = 20;
const shotsDir = () => new Directory(Paths.document, 'mind-shots');

/** Opens the system picker; returns how many screenshots were added (0 when it was cancelled). */
export async function pickScreenshots(store: MindStore): Promise<number> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MAX_PICK, quality: 1, exif: false });
  if (result.canceled || result.assets.length === 0) return 0;
  const dir = shotsDir();
  if (!dir.exists) dir.create({ intermediates: true });
  const rows: Array<{ assetId: string; uri: string; takenAt: number }> = [];
  for (const asset of result.assets) {
    try {
      const id = randomUUID();
      const dest = new File(dir, `${id}.jpg`);
      await new File(asset.uri).copy(dest);
      rows.push({ assetId: id, uri: dest.uri, takenAt: Date.now() });
    } catch { /* a picture that can't be copied is skipped */ }
  }
  return rows.length ? store.addScreenshots(rows) : 0;
}
