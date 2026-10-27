import * as DocumentPicker from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { Directory, File, Paths } from 'expo-file-system';
import { ComicOpenError, extractNestedComic, listNestedComics, openComicSource } from './ComicSource';
import { parseComicInfo, displayTitle } from './formats/comicInfo';
import { linkReaderComic, setWorkCover, unlinkReaderComic } from './libraryLink';
import { saveCover } from './cover';
import type { ComicSource } from './ComicSource';
import { Platform } from 'react-native';
import { optionalNative } from './nativeArchive';
import { BOOKMARK_PREFIX, NESTED_SEP, cacheDirFor, cachedFileFor, copyFromSource, ensureLocalCopy, freeSpaceFor, isCached, trimIfAuto } from './cloudCache';
import { createFolder, deleteReaderComic, fillInComic, getReaderComic, insertReaderComic, isDuplicateSource, setComicStorage, sourceKeyOf, unpreparedLinkIds, type ReaderMode } from './readerLibrary';

export type ImportResult = { imported: string[]; /** Already in the library, so left alone. */ skipped: string[]; failed: Array<{ name: string; reason: string }> };
const emptyResult = (): ImportResult => ({ imported: [], skipped: [], failed: [] });

const titleOf = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || name;

const comicsRoot = () => new Directory(Paths.document, 'comics');

/** Lets a screen show "3 of 12" and stop a long import: set `cancel.cancelled` and the import ends after the file it is on. */
export type ImportProgress = { onProgress?: (p: { done: number; total: number; name: string; phase?: string }) => void; cancel?: { cancelled: boolean } };

export type ImportOptions = {
  folderId?: string;
  /** Keep the file where it is (Drive, Dropbox…) and only remember the link. */
  sourceUri?: string;
  /** Where to copy the file from when `uri` isn't readable by itself: a bookmark on iOS, a content address on Android. */
  fetchFrom?: string;
  /** Size of the original file in bytes. With the name it tells whether this file is already in the library. */
  size?: number;
  /** `uri` is a comic just taken out of a linked zip bundle: keep it as a cached link, don't fetch anything. */
  nested?: boolean;
};

/** Runs `one` for each item, reporting progress, and stops early when asked. */
async function eachWithProgress<T>(items: T[], progress: ImportProgress, nameOf: (item: T) => string, one: (item: T) => Promise<void>, phase?: string): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    if (progress.cancel?.cancelled) return;
    progress.onProgress?.({ done: i, total: items.length, name: nameOf(items[i]), phase });
    await one(items[i]);
  }
  progress.onProgress?.({ done: items.length, total: items.length, name: '', phase });
}

async function importFile(uri: string, name: string, result: ImportResult, opts: ImportOptions = {}, depth = 0): Promise<void> {
  if (opts.size && isDuplicateSource(name, opts.size, titleOf(name))) { result.skipped.push(name); return; }
  const id = randomUUID();
  const dir = new Directory(comicsRoot(), id);
  try {
    dir.create();
    // A linked (cloud) comic's file goes to the cache, which cleans itself up; its cover stays here for good.
    const bookDir = opts.sourceUri ? cacheDirFor(id) : dir;
    if (opts.sourceUri) bookDir.create({ intermediates: true });
    const stored = new File(bookDir, 'book');
    const fetchFrom = opts.sourceUri && !opts.nested ? opts.sourceUri : opts.fetchFrom;
    if (fetchFrom) await copyFromSource(fetchFrom, stored.uri);
    else if (opts.nested) {
      // A rename, not a second copy; if the move isn't possible it falls back to copying.
      try { await new File(uri).move(stored); } catch { await new File(uri).copy(stored); }
    } else await new File(uri).copy(stored); // async in SDK 57: opening before it resolves reads a partial file
    let source;
    try {
      source = await openComicSource(stored.uri, `import-${id}`);
    } catch (e) {
      // A plain zip with no pages of its own may be a bundle of comics: import each one inside.
      // Only zips can hold nested comics; anything else keeps its original "no pages" error.
      if (e instanceof ComicOpenError && e.code === 'no-pages' && depth === 0 && await importBundle(stored.uri, result, opts)) {
        dir.delete(); try { if (bookDir.exists) bookDir.delete(); } catch { /* cache */ }
        return;
      }
      throw e;
    }
    let coverPath: string | null = null;
    try { coverPath = await saveCover(await source.getPageUri(0), dir); } catch { /* a missing cover is not fatal */ }
    // ComicInfo.xml gives a real title, series, writer and the manga (right-to-left) hint.
    const xml = await source.readComicInfo();
    const info = xml ? parseComicInfo(xml) : {};
    insertReaderComic({
      id, title: displayTitle(info, titleOf(name)), path: stored.uri, format: source.format, pageCount: source.pageCount, coverPath,
      series: info.series ?? null, issue: info.number ?? null, writer: info.writer ?? null, folderId: opts.folderId ?? null,
      mode: info.rtl ? 'rtl' : 'ltr', sourceUri: opts.sourceUri ?? null, sizeBytes: (() => { try { return new File(stored.uri).size ?? null; } catch { return null; } })(), sourceKey: opts.size ? sourceKeyOf(name, opts.size) : null,
    });
    // Into the library too, owned digitally — and into the catalog if it isn't there yet.
    try { linkReaderComic({ id, title: displayTitle(info, titleOf(name)), series: info.series ?? null, writer: info.writer ?? null, coverPath, workId: null }); } catch { /* the file is still readable without the link */ }
    source.close();
    // A linked comic's file sits in the cache: keep the cache within its limit as we go, not only when something is read.
    if (opts.sourceUri) trimIfAuto(id);
    result.imported.push(name);
  } catch (e) {
    try { if (dir.exists) dir.delete(); } catch { /* ignore */ }
    try { if (opts.sourceUri) cacheDirFor(id).delete(); } catch { /* ignore */ }
    result.failed.push({ name, reason: reasonOf(e, 'Could not import this file') });
  }
}

type Picked = { uri: string; name: string; size?: number; /** How to reopen it later: a bookmark on iOS, its own address on Android. */ source: string };

/**
 * Let the reader choose files and come straight back to the app. Nothing is copied or downloaded here, so a 500 MB file in Drive
 * doesn't keep you waiting inside Files. (The stock iOS picker copies each file first; this one opens them where they are.)
 */
async function pickInPlace(keepAccess: boolean): Promise<Picked[]> {
  const native = optionalNative();
  if (Platform.OS === 'ios' && native?.pickFilesInPlace) {
    const items = await native.pickFilesInPlace();
    return items.filter((i) => i.bookmark).map((i) => ({ uri: i.uri, name: i.name, size: i.size || undefined, source: BOOKMARK_PREFIX + i.bookmark }));
  }
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: false });
  if (picked.canceled) return [];
  return picked.assets.map((a) => {
    // Without this Android forgets the file the moment the app closes.
    if (keepAccess) { try { native?.persistUriPermission?.(a.uri); } catch { /* some providers don't offer it; the link then lasts for this session */ } }
    return { uri: a.uri, name: a.name, size: a.size ?? undefined, source: a.uri };
  });
}

/** Add one linked comic to the shelf from its name and size alone: nothing is fetched. Returns its id, or null if it is already in the library. */
function linkWithoutDownloading(file: { name: string; size?: number; source: string; folderId?: string }, result: ImportResult): string | null {
  if (file.size && isDuplicateSource(file.name, file.size, titleOf(file.name))) { result.skipped.push(file.name); return null; }
  const id = randomUUID(); const title = titleOf(file.name);
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  insertReaderComic({
    id, title, path: cachedFileFor(id).uri, format: FORMAT_OF[ext] ?? 'cbz', pageCount: 0, coverPath: null,
    folderId: file.folderId ?? null, sizeBytes: file.size ?? null, sourceUri: file.source, sourceKey: file.size ? sourceKeyOf(file.name, file.size) : null,
  });
  try { linkReaderComic({ id, title, series: null, writer: null, coverPath: null, workId: null }); } catch { /* readable without the library link */ }
  result.imported.push(file.name);
  return id;
}

/** Pick one or more files and copy them into app storage. You are back in the app at once; the copying shows as progress. With `folderId`, they land in that folder. */
export async function pickAndImportComics(opts: Pick<ImportOptions, 'folderId'> & ImportProgress = {}): Promise<ImportResult> {
  const picked = await pickInPlace(false);
  const result = emptyResult();
  if (!picked.length) return result;
  const root = comicsRoot();
  if (!root.exists) root.create({ intermediates: true });
  await eachWithProgress(picked, opts, (f) => f.name, (f) => importFile(f.uri, f.name, result, { folderId: opts.folderId, fetchFrom: f.source, size: f.size }), 'Importing');
  return result;
}

/**
 * Pick comics from Drive, Dropbox or any cloud app and keep them THERE. They appear on the shelf at once, from their file names, and
 * nothing is downloaded: a comic is fetched when you open it, and its cover and page count are filled in then.
 */
export async function pickAndLinkComics(opts: Pick<ImportOptions, 'folderId'> & ImportProgress = {}): Promise<ImportResult> {
  const picked = await pickInPlace(true);
  const result = emptyResult();
  if (!picked.length) return result;
  const root = comicsRoot();
  if (!root.exists) root.create({ intermediates: true });
  await eachWithProgress(picked, opts, (f) => f.name, async (f) => {
    try { linkWithoutDownloading({ ...f, folderId: opts.folderId }, result); }
    catch { result.failed.push({ name: f.name, reason: 'Could not link this file.' }); }
  }, 'Linking');
  return result;
}

export function removeComics(ids: string[]): void { for (const id of ids) removeComic(id); }

/** A zip with no pages of its own may be a bundle of comics: import each one inside. A linked bundle's comics stay links. Returns how many it held. */
async function importBundle(zipUri: string, result: ImportResult, opts: ImportOptions): Promise<number> {
  let entries: string[] = [];
  try { entries = listNestedComics(zipUri); } catch { /* not a zip */ }
  for (const entry of entries) {
    const tmp = new File(Paths.cache, `nested-${randomUUID()}`);
    try {
      extractNestedComic(zipUri, entry, tmp);
      const sourceUri = opts.sourceUri ? `${opts.sourceUri}${NESTED_SEP}${entry}` : undefined;
      await importFile(tmp.uri, entry.split('/').pop() ?? entry, result, { folderId: opts.folderId, sourceUri, nested: !!sourceUri, size: sizeOf(tmp) }, 1);
    } finally { try { if (tmp.exists) tmp.delete(); } catch { /* ignore */ } }
  }
  return entries.length;
}

/** Why something failed, in words: our own messages as they are, anything else with its detail so it can be reported. */
function reasonOf(e: unknown, fallback: string): string {
  if (e instanceof ComicOpenError) return e.message;
  const detail = e instanceof Error ? e.message.replace(/\s+/g, ' ').slice(0, 140) : '';
  if (__DEV__ || detail) console.warn('import failed:', e);
  return detail ? `${fallback} (${detail}).` : `${fallback}.`;
}

const sizeOf = (f: File): number | undefined => { try { return f.size || undefined; } catch { return undefined; } };

export function removeComic(id: string): void {
  const comic = getReaderComic(id);
  if (comic) {
    try { const dir = new Directory(comicsRoot(), id); if (dir.exists) dir.delete(); } catch { /* ignore */ }
    try { const cached = cacheDirFor(id); if (cached.exists) cached.delete(); } catch { /* ignore */ }
  }
  try { unlinkReaderComic(id); } catch { /* the library entry is cosmetic; the file removal matters more */ }
  deleteReaderComic(id);
}

const COMIC_EXT = ['cbz', 'cbr', 'cb7', 'zip', 'pdf', 'epub'];
const MAX_FOLDER_DEPTH = 4;

function collectComicFiles(dir: Directory, depth = 0): File[] {
  const out: File[] = [];
  if (depth > MAX_FOLDER_DEPTH) return out;
  for (const entry of dir.list()) {
    if (entry instanceof Directory) out.push(...collectComicFiles(entry, depth + 1));
    else if (COMIC_EXT.includes(entry.extension.replace('.', '').toLowerCase())) out.push(entry);
  }
  return out;
}

/** Pick a whole folder; every comic file inside it is imported and grouped into a library folder of the same name. */
export async function pickAndImportFolder(opts: { parentId?: string } & ImportProgress = {}): Promise<ImportResult> {
  const result = emptyResult();
  let dir: Directory;
  try { dir = await Directory.pickDirectoryAsync(); } catch { return result; } // cancelled
  const files = collectComicFiles(dir);
  const root = comicsRoot();
  if (!root.exists) root.create({ intermediates: true });
  const folderId = files.length ? createFolder(dir.name || 'Imported', opts.parentId ?? null) : undefined;
  await eachWithProgress(files, opts, (f) => f.name, (f) => importFile(f.uri, f.name, result, { folderId, size: sizeOf(f) }));
  return result;
}

/** Import a file that is already on the phone (a download, say) — same path as the picker, one file. */
export async function importLocalFile(uri: string, name: string, opts: ImportOptions = {}): Promise<ImportResult> {
  const result = emptyResult();
  const root = comicsRoot();
  if (!root.exists) root.create({ intermediates: true });
  await importFile(uri, name, result, opts);
  return result;
}

/** Turn a cloud link into a normal comic stored on this phone (so it reads offline). */
export async function keepCopyOnDevice(id: string): Promise<boolean> {
  const comic = getReaderComic(id);
  if (!comic?.sourceUri) return true;
  const { ensureLocalCopy, freeSpaceFor } = await import('./cloudCache');
  const cached = await ensureLocalCopy(comic);
  const dir = new Directory(comicsRoot(), id);
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, 'book');
  await new File(cached).copy(dest);
  setComicStorage(id, dest.uri, null);
  freeSpaceFor(id);
  return true;
}


// ---- linking a whole folder -------------------------------------------------------------------------------------------
// A folder link does not download anything up front: each comic is added to the shelf straight away from its file name and size,
// and its cover and page count are read afterwards by `prepareLinkedComics`, one at a time, which can be stopped and resumed.

const LINK_EXT = ['cbz', 'cbr', 'cb7', 'zip', 'pdf', 'epub'];
const FORMAT_OF: Record<string, 'cbz' | 'cbr' | 'cb7' | 'pdf' | 'epub'> = { cbz: 'cbz', zip: 'cbz', cbr: 'cbr', cb7: 'cb7', pdf: 'pdf', epub: 'epub' };
const MAX_LINK_DEPTH = 8;

type Found = { file: File; /** Folder names from the picked folder down, then the file name. */ path: string[] };

function scanForComics(dir: Directory, path: string[] = []): Found[] {
  const out: Found[] = [];
  if (path.length > MAX_LINK_DEPTH) return out;
  for (const entry of dir.list()) {
    if (entry.name.startsWith('.')) continue;
    if (entry instanceof Directory) out.push(...scanForComics(entry, [...path, entry.name]));
    else if (LINK_EXT.includes(entry.extension.replace('.', '').toLowerCase())) out.push({ file: entry, path: [...path, entry.name] });
  }
  return out;
}

/** Pick a folder in Drive, Dropbox or any cloud app and link every comic inside it, keeping its folders. Nothing is downloaded yet. */
export async function pickAndLinkFolder(opts: { parentId?: string } & ImportProgress = {}): Promise<ImportResult> {
  const result = emptyResult();
  let dir: Directory;
  try { dir = await Directory.pickDirectoryAsync(); } catch { return result; } // cancelled
  const native = optionalNative();
  let bookmark: string | null = null;
  try {
    if (Platform.OS === 'ios') bookmark = native?.makeBookmark?.(dir.uri) ?? null;
    else native?.persistUriPermission?.(dir.uri);
  } catch { /* handled below on iOS; Android then keeps the link for this session */ }
  if (Platform.OS === 'ios' && !bookmark) { result.failed.push({ name: dir.name || 'Folder', reason: 'This cloud app doesn’t let ComicPill keep a link to a folder.' }); return result; }

  opts.onProgress?.({ done: 0, total: 0, name: 'Looking through the folder…' });
  const found = scanForComics(dir);
  const root = comicsRoot();
  if (!root.exists) root.create({ intermediates: true });

  // The shelf gets the same folders as the cloud: Drive's “One Piece / Vol 1” becomes a folder inside a folder.
  const folderIds = new Map<string, string>();
  const folderFor = (names: string[]): string => {
    let parent: string | null = opts.parentId ?? null; let key = '';
    for (const name of [dir.name || 'Linked comics', ...names]) {
      key += `/${name}`;
      let id = folderIds.get(key);
      if (!id) { id = createFolder(name, parent); folderIds.set(key, id); }
      parent = id;
    }
    return parent as string;
  };

  await eachWithProgress(found, opts, (f) => f.file.name, async ({ file, path }) => {
    try {
      const size = sizeOf(file);
      if (size && isDuplicateSource(file.name, size, titleOf(file.name))) { result.skipped.push(file.name); return; }
      const source = bookmark ? `${BOOKMARK_PREFIX}${bookmark}|${path.join('/')}` : file.uri;
      if (size && isDuplicateSource(file.name, size, titleOf(file.name))) { result.skipped.push(file.name); return; }
      linkWithoutDownloading({ name: file.name, size, source, folderId: folderFor(path.slice(0, -1)) }, result);
    } catch { result.failed.push({ name: file.name, reason: 'Could not link this file.' }); }
  });
  return result;
}

/** Fill in a linked comic's cover, page count and details from its opened file. Returns its title. */
export async function completeLinkedComic(comic: { id: string; title: string; workId: string | null }, source: ComicSource): Promise<string> {
  const root = comicsRoot();
  let coverPath: string | null = null;
  try {
    const dir = new Directory(root, comic.id);
    if (!dir.exists) dir.create({ intermediates: true });
    coverPath = await saveCover(await source.getPageUri(0), dir);
  } catch { /* a missing cover is not fatal */ }
  const xml = await source.readComicInfo();
  const info = xml ? parseComicInfo(xml) : {};
  const title = displayTitle(info, comic.title);
  const mode: ReaderMode | null = info.rtl ? 'rtl' : null;
  fillInComic(comic.id, { title, pageCount: source.pageCount, coverPath, series: info.series ?? null, issue: info.number ?? null, writer: info.writer ?? null, mode });
  try { const workId = linkReaderComic({ id: comic.id, title, series: info.series ?? null, writer: info.writer ?? null, coverPath, workId: comic.workId }); if (coverPath) setWorkCover(workId, coverPath); } catch { /* the shelf already has it */ }
  return title;
}

/** A linked zip that turns out to hold several comics: they are linked in its place. Returns how many. */
export async function expandLinkedBundle(comic: { id: string; sourceUri: string | null; folderId: string | null }): Promise<number> {
  if (!comic.sourceUri || comic.sourceUri.includes(NESTED_SEP)) return 0;
  const held = await importBundle(cachedFileFor(comic.id).uri, emptyResult(), { folderId: comic.folderId ?? undefined, sourceUri: comic.sourceUri });
  if (held) removeComic(comic.id);
  return held;
}

/** Read the cover, page count and details of linked comics that haven't been looked at yet, one at a time. Each file is fetched, read, then released. */
export async function prepareLinkedComics(opts: ImportProgress & { /** Only these; by default every linked comic that is still waiting. */ ids?: string[] } = {}): Promise<ImportResult> {
  const result = emptyResult();
  const root = comicsRoot();
  if (!root.exists) root.create({ intermediates: true });
  await eachWithProgress(opts.ids ?? unpreparedLinkIds(), opts, (id) => getReaderComic(id)?.title ?? '', async (id) => {
    const comic = getReaderComic(id);
    if (!comic?.sourceUri) return;
    const wasCached = isCached(id);
    try {
      const source = await openComicSource(await ensureLocalCopy(comic), `prepare-${id}`);
      try {
        result.imported.push(await completeLinkedComic(comic, source));
      } finally { source.close(); }
    } catch (e) {
      // A linked zip that is really a bundle of comics: its comics are linked in its place.
      if (e instanceof ComicOpenError && e.code === 'no-pages' && !comic.sourceUri.includes(NESTED_SEP)) {
        try {
          if (await importBundle(cachedFileFor(id).uri, result, { folderId: comic.folderId ?? undefined, sourceUri: comic.sourceUri })) { removeComic(id); return; }
        } catch { /* reported below */ }
      }
      result.failed.push({ name: comic.title, reason: reasonOf(e, 'Could not fetch or read this comic') });
    } finally {
      if (!wasCached) freeSpaceFor(id); // a bulk pass must not fill the cache with files nobody asked to read
    }
  }, 'Loading covers');
  return result;
}
