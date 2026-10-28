// Comics that stay in Drive, Dropbox or any other cloud app are only fetched when you read them, into a cache that cleans itself up.
// The cover, title and page count are kept on the phone, so the shelf looks the same as for any other comic.
import * as LegacyFS from 'expo-file-system/legacy';
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { Directory, File, Paths } from 'expo-file-system';
import { getReaderComic, type ReaderComic } from './readerLibrary';
import { pickEvictions } from './evict';
import { budgetMode, cloudBudgetBytes, keepLimit, LOW_SPACE_RESERVE } from './cloudBudget';
import { isLowOnSpace, planRoom, type ReadyComic, type RoomPlan } from './makeRoom';
import { optionalNative } from './nativeArchive';
import { extractNestedComic } from './ComicSource';
import { downloadFromOpds, isOpdsSource } from '../opds/source';


// Downloaded comics are kept in the app's own support folder, not in the cache folder iOS empties when storage runs low, and left out of iCloud
// backups (they can always be fetched again). Android has no such folder, so its app files folder is used.
const oldCacheRoot = () => new Directory(Paths.cache, 'comics-cache');
const downloadsRoot = (): Directory => {
  const support = Paths.document.parentDirectory ? new Directory(Paths.document.parentDirectory, 'Library', 'Application Support') : null;
  return support && support.uri.includes('/Library/') ? new Directory(support, 'comicpill-downloads') : new Directory(Paths.document, 'comicpill-downloads');
};
let adopted = false;
/** Comics fetched by an earlier version sat in the cache folder: move them across once, so they stay readable offline. */
function adoptOldDownloads(root: Directory): void {
  try {
    const old = oldCacheRoot();
    if (!old.exists) return;
    if (!root.exists) root.create({ intermediates: true });
    for (const entry of old.list()) {
      if (!(entry instanceof Directory)) continue;
      try { const book = new File(entry, 'book'); const target = new Directory(root, entry.name); target.create({ intermediates: true }); if (book.exists) void Promise.resolve(book.move(new File(target, 'book'))).catch(() => undefined); } catch { /* it is fetched again if needed */ }
    }
  } catch { /* nothing to carry over */ }
}
export const cacheRoot = (): Directory => {
  const root = downloadsRoot();
  if (!adopted) {
    adopted = true;
    try { if (!root.exists) root.create({ intermediates: true }); optionalNative()?.excludeFromBackup?.(root.uri); } catch { /* the folder is made again when a comic is fetched */ }
    adoptOldDownloads(root);
  }
  return root;
};
export const cacheDirFor = (id: string) => new Directory(cacheRoot(), id);
export const cachedFileFor = (id: string) => new File(cacheDirFor(id), 'book');

const sizeOf = (file: File): number => { try { return file.exists ? (file.size ?? 0) : 0; } catch { return 0; } };

export function trimCloudCache(keepId: string, limit = cloudBudgetBytes()): void {
  try {
    const root = cacheRoot();
    if (!root.exists) return;
    const entries = root.list().filter((e): e is Directory => e instanceof Directory).map((dir) => {
      const id = dir.name; const comic = getReaderComic(id);
      return { id, bytes: sizeOf(new File(dir, 'book')), lastReadAt: comic?.lastReadAt ?? comic?.addedAt ?? 0 };
    });
    for (const id of pickEvictions(entries, limit, keepId)) { try { cacheDirFor(id).delete(); } catch { /* it will be fetched again if needed */ } }
  } catch { /* trimming is housekeeping, never a reason to fail */ }
}

/** In "automatic" mode the least recently read comics go when the budget is passed. In "ask" mode nothing is removed without the reader's say-so. */
export function trimIfAuto(keepId: string): void { if (budgetMode() === 'auto') trimCloudCache(keepId); }

/** The comics that are downloaded right now, with what each takes: the ones that could be put away. */
export function readyComics(exceptId?: string): ReadyComic[] {
  const out: ReadyComic[] = [];
  try {
    const root = cacheRoot();
    if (!root.exists) return out;
    for (const dir of root.list()) {
      if (!(dir instanceof Directory) || dir.name === exceptId) continue;
      const comic = getReaderComic(dir.name);
      if (!comic) continue;
      out.push({ id: comic.id, title: comic.title, bytes: sizeOf(new File(dir, 'book')), lastReadAt: comic.lastReadAt ?? comic.addedAt });
    }
  } catch { /* an unreadable cache simply offers nothing to put away */ }
  return out;
}

/** Would fetching this comic fit in the space the reader allowed, and if not, what would make it fit? */
export const planFetch = (comic: ReaderComic): RoomPlan => planRoom(readyComics(comic.id), cloudBudgetBytes(), comic.sizeBytes ?? 0, keepLimit() || Infinity);

/** What putting several comics on the device at once would need: space and how many may be kept. */
export const planDownloads = (comics: ReaderComic[]): RoomPlan =>
  planRoom(readyComics(), cloudBudgetBytes(), comics.reduce((n, c) => n + (c.sizeBytes ?? 0), 0), keepLimit() || Infinity, comics.length);

export const isCached = (id: string): boolean => { try { return cachedFileFor(id).exists; } catch { return false; } };

/** Delete the fetched copy (the link and the cover stay). Returns true if something was freed. */
export function freeSpaceFor(id: string): boolean {
  try { const dir = cacheDirFor(id); if (dir.exists) { dir.delete(); return true; } } catch { /* ignore */ }
  return false;
}

export class CloudFetchError extends Error {}
export class LowSpaceError extends CloudFetchError {}

/** Where to clear the other copy: the cloud app keeps its own download, which ComicPill can't remove. */
export const CLOUD_APP_CACHE_HINT = 'Google Drive and Dropbox keep their own downloaded copy too. Clear it in their settings (Drive: Settings → Clear cache).';

const formatGb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

/** iOS keeps a cloud link as a bookmark; Android keeps the picked address itself. A file inside a linked folder is `bookmark:<folder>|<path inside it>`. */
export const BOOKMARK_PREFIX = 'bookmark:';

/** A comic inside a linked zip bundle is remembered as `<link to the zip><NESTED_SEP><its path inside the zip>`. */
export const NESTED_SEP = '\u001F';

/** Copy a linked comic from its cloud app to `destUri`. */
export async function copyFromSource(sourceUri: string, destUri: string): Promise<void> {
  if (isOpdsSource(sourceUri)) { await downloadFromOpds(sourceUri, destUri); return; }
  if (sourceUri.startsWith(BOOKMARK_PREFIX)) {
    const native = optionalNative();
    if (!native?.copyFromBookmark) throw new CloudFetchError('This build can’t open cloud links.');
    const rest = sourceUri.slice(BOOKMARK_PREFIX.length);
    const bar = rest.indexOf('|'); // base64 never contains it, so the first one splits bookmark from path
    await native.copyFromBookmark(bar < 0 ? rest : rest.slice(0, bar), destUri.replace(/^file:\/\//, ''), bar < 0 ? '' : rest.slice(bar + 1));
    return;
  }
  await LegacyFS.copyAsync({ from: sourceUri, to: destUri });
}

/** The path to read this comic from: its own file, or — for a cloud link — a cached copy, fetched now if it isn't there. `onProgress` reports how much has arrived. */
export async function ensureLocalCopy(comic: ReaderComic, onProgress?: (p: { bytes: number; total: number | null }) => void): Promise<string> {
  if (!comic.sourceUri) return comic.path;
  const target = cachedFileFor(comic.id);
  if (target.exists && sizeOf(target) > 0) return target.uri;
  const need = comic.sizeBytes ?? 0;
  const free = Paths.availableDiskSpace;
  // A comic inside a zip needs the whole zip on the device for a moment as well.
  if (need > 0 && isLowOnSpace(free, need * 2, LOW_SPACE_RESERVE)) {
    throw new LowSpaceError(`There isn’t enough free space on this device (${formatGb(free)} free, this comic needs about ${formatGb(need)}). Free some space first. ${CLOUD_APP_CACHE_HINT}`);
  }
  const watch = onProgress ? setInterval(() => onProgress({ bytes: sizeOf(target), total: need || null }), 400) : null;
  try {
    const dir = cacheDirFor(comic.id);
    if (!dir.exists) dir.create({ intermediates: true });
    const sep = comic.sourceUri.indexOf(NESTED_SEP);
    if (sep < 0) await copyFromSource(comic.sourceUri, target.uri);
    else {
      // Inside a zip bundle: fetch the zip, take this one comic out, and let the zip go.
      const bundle = new File(dir, 'bundle.tmp');
      try { await copyFromSource(comic.sourceUri.slice(0, sep), bundle.uri); extractNestedComic(bundle.uri, comic.sourceUri.slice(sep + 1), target); }
      finally { try { if (bundle.exists) bundle.delete(); } catch { /* it sits in the cache anyway */ } }
    }
  } catch {
    try { cacheDirFor(comic.id).delete(); } catch { /* ignore */ }
    throw new CloudFetchError(isOpdsSource(comic.sourceUri) ? 'Couldn’t fetch this comic from your comic server. Check that the server is on and on the same network, then try again.' : 'Couldn’t fetch this comic from its cloud app. Check your connection and that the app (Drive, Dropbox…) still has access, then try again.');
  } finally { if (watch) clearInterval(watch); }
  trimIfAuto(comic.id);
  return target.uri;
}
