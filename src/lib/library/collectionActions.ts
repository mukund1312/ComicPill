// What My Collection can do to the comics you pick: see which are downloaded, put the downloads away, or take comics out of the collection.
import { sqlite } from '../db/client';
import { upsertLibraryEntry } from '../db/queries/library';
import { ensureLocalCopy, freeSpaceFor, isCached, planDownloads, readyComics } from '../reader/cloudCache';
import { eachWithProgress, emptyResult, reasonOf, removeComics, type ImportProgress, type ImportResult } from '../reader/importComics';
import { getReaderComic, type ReaderComic } from '../reader/readerLibrary';
import type { RoomPlan } from '../reader/makeRoom';

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

/** The file that backs a work (the oldest one, if several do), or null for a comic that exists only on a shelf. */
export function readerComicForWork(workId: string): ReaderComic | null {
  const row = sqlite.getFirstSync<{ id: string }>('SELECT id FROM reader_comics WHERE work_id = ? ORDER BY added_at LIMIT 1', workId);
  return row ? getReaderComic(row.id) : null;
}

/** work id -> reader comic id, for every comic that has a file behind it. */
export function readerIdsByWork(): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of sqlite.getAllSync<{ id: string; work_id: string }>('SELECT id, work_id FROM reader_comics WHERE work_id IS NOT NULL ORDER BY added_at DESC')) map.set(r.work_id, r.id);
  return map;
}

/** The comics among these works that live on Drive or a server and are not on the device yet. */
export const toDownload = (workIds: string[]): ReaderComic[] =>
  workIds.flatMap((workId) => { const c = readerComicForWork(workId); return c && c.sourceUri && !isCached(c.id) ? [c] : []; });

/** What fetching these would need: how far over the space set aside, or the number allowed, it takes things. */
export const planFor = (comics: ReaderComic[]): RoomPlan => planDownloads(comics);

/** Fetch each comic to the device, one at a time, so it can be read offline. */
export async function downloadComics(comics: ReaderComic[], progress: ImportProgress = {}): Promise<ImportResult> {
  const result = emptyResult();
  await eachWithProgress(comics, progress, (c) => c.title, async (comic) => {
    try { await ensureLocalCopy(comic); result.imported.push(comic.title); }
    catch (e) { result.failed.push({ name: comic.title, reason: reasonOf(e, 'Could not download this comic') }); }
  }, 'Downloading');
  return result;
}
