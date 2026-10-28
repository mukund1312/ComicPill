// A reader's own cover for a comic in their library: picked from their photos or files, shrunk, and kept on the device.
// It is stored against their library entry, so it never touches the catalog artwork other screens (and other copies) rely on.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { Directory, File, Paths } from 'expo-file-system';
import { upsertLibraryEntry } from '../db/queries/library';
import { registerCustomCover } from '../../ui/fileCovers';

const COVER_WIDTH = 800;
const coversDir = () => new Directory(Paths.document, 'covers');

/** Use the picture at `sourceUri` as this comic's cover in the reader's library. Returns where it was saved. */
export async function setCustomCover(workId: string, sourceUri: string): Promise<string> {
  const dir = coversDir();
  if (!dir.exists) dir.create({ intermediates: true });
  const small = await (await ImageManipulator.manipulate(sourceUri).resize({ width: COVER_WIDTH }).renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  const target = new File(dir, `${workId}-${Date.now()}.jpg`); // a new name each time, so a replaced cover isn't served from the image cache
  await new File(small.uri).move(target);
  clearFile(workId);
  upsertLibraryEntry(workId, { customCoverPath: target.uri });
  registerCustomCover(workId, target.uri);
  return target.uri;
}

/** Back to the catalog artwork (or the placeholder if the comic has none). */
export function clearCustomCover(workId: string): void {
  clearFile(workId);
  upsertLibraryEntry(workId, { customCoverPath: null });
  registerCustomCover(workId, null);
}

function clearFile(workId: string): void {
  try { const dir = coversDir(); if (dir.exists) for (const f of dir.list()) if (f.name.startsWith(`${workId}-`)) f.delete(); } catch { /* an old cover left behind is harmless */ }
}
