// What My Collection can do to the comics you pick: see which are downloaded, put the downloads away, or take comics out of the collection.
import { sqlite } from '../db/client';
import { upsertLibraryEntry } from '../db/queries/library';
import { freeSpaceFor, readyComics } from '../reader/cloudCache';
import { removeComics } from '../reader/importComics';
import { getReaderComic } from '../reader/readerLibrary';

const readerIdsFor = (workId: string): string[] =>
  sqlite.getAllSync<{ id: string }>('SELECT id FROM reader_comics WHERE work_id = ?', workId).map((r) => r.id);

/** Works whose comic is downloaded to this device right now. */
export function downloadedWorkIds(): Set<string> {
  const out = new Set<string>();
  for (const ready of readyComics()) { const workId = getReaderComic(ready.id)?.workId; if (workId) out.add(workId); }
  return out;
}

/** Give the downloaded copies back. The comics stay in the collection with their covers and are fetched again when opened. Returns how many were put away. */
export function putAway(workIds: string[]): number {
  let n = 0;
  for (const workId of workIds) for (const id of readerIdsFor(workId)) if (freeSpaceFor(id)) n++;
  return n;
}

/** Take comics out of My Collection. Files you added are removed from the device; comics linked from Drive or a comic server stay where they are. */
export function removeFromCollection(workIds: string[]): void {
  for (const workId of workIds) {
    const ids = readerIdsFor(workId);
    if (ids.length) removeComics(ids);
    // (a catalog entry made only for a file went with the file)
    if (sqlite.getFirstSync('SELECT 1 FROM works WHERE id = ?', workId)) { try { upsertLibraryEntry(workId, { own: 'none' }); } catch { /* nothing more to change */ } }
  }
}
