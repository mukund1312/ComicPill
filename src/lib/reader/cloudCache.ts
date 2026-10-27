// Comics that stay in Drive, Dropbox or any other cloud app are only fetched when you read them, into a cache that cleans itself up.
// The cover, title and page count are kept on the phone, so the shelf looks the same as for any other comic.
import * as LegacyFS from 'expo-file-system/legacy';
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { Directory, File, Paths } from 'expo-file-system';
import { getReaderComic, type ReaderComic } from './readerLibrary';
import { pickEvictions } from './evict';
import { optionalNative } from './nativeArchive';
import { extractNestedComic } from './ComicSource';

/** How much fetched cloud comics may take before the least-recently-read ones are dropped. */
export const CLOUD_CACHE_LIMIT = 2 * 1024 * 1024 * 1024;

const cacheRoot = () => new Directory(Paths.cache, 'comics-cache');
export const cacheDirFor = (id: string) => new Directory(cacheRoot(), id);
export const cachedFileFor = (id: string) => new File(cacheDirFor(id), 'book');

const sizeOf = (file: File): number => { try { return file.exists ? (file.size ?? 0) : 0; } catch { return 0; } };

export function trimCloudCache(keepId: string, limit = CLOUD_CACHE_LIMIT): void {
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

export const isCached = (id: string): boolean => { try { return cachedFileFor(id).exists; } catch { return false; } };

/** Delete the fetched copy (the link and the cover stay). Returns true if something was freed. */
export function freeSpaceFor(id: string): boolean {
  try { const dir = cacheDirFor(id); if (dir.exists) { dir.delete(); return true; } } catch { /* ignore */ }
  return false;
}

export class CloudFetchError extends Error {}

/** iOS keeps a cloud link as a bookmark; Android keeps the picked address itself. A file inside a linked folder is `bookmark:<folder>|<path inside it>`. */
export const BOOKMARK_PREFIX = 'bookmark:';

/** A comic inside a linked zip bundle is remembered as `<link to the zip><NESTED_SEP><its path inside the zip>`. */
export const NESTED_SEP = '\u001F';

/** Copy a linked comic from its cloud app to `destUri`. */
export async function copyFromSource(sourceUri: string, destUri: string): Promise<void> {
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

/** The path to read this comic from: its own file, or — for a cloud link — a cached copy, fetched now if it isn't there. */
export async function ensureLocalCopy(comic: ReaderComic): Promise<string> {
  if (!comic.sourceUri) return comic.path;
  const target = cachedFileFor(comic.id);
  if (target.exists && sizeOf(target) > 0) return target.uri;
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
    throw new CloudFetchError('Couldn’t fetch this comic from its cloud app. Check your connection and that the app (Drive, Dropbox…) still has access, then try again.');
  }
  trimCloudCache(comic.id);
  return target.uri;
}
