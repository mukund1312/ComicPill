import * as DocumentPicker from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { Directory, File, Paths } from 'expo-file-system';
import { ComicOpenError, extractNestedComic, listNestedComics, openComicSource } from './ComicSource';
import { parseComicInfo, displayTitle } from './formats/comicInfo';
import { linkReaderComic, setWorkCover, unlinkReaderComic } from './libraryLink';
import { Platform } from 'react-native';
import { optionalNative } from './nativeArchive';
import { BOOKMARK_PREFIX, cacheDirFor, cachedFileFor, copyFromSource, ensureLocalCopy, freeSpaceFor, isCached, trimCloudCache } from './cloudCache';
import { createFolder, deleteReaderComic, fillInComic, getReaderComic, insertReaderComic, isDuplicateSource, setComicStorage, sourceKeyOf, unpreparedLinkIds, type ReaderMode } from './readerLibrary';

export type ImportResult = { imported: string[]; /** Already in the library, so left alone. */ skipped: string[]; failed: Array<{ name: string; reason: string }> };
const emptyResult = (): ImportResult => ({ imported: [], skipped: [], failed: [] });

const titleOf = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || name;

const comicsRoot = () => new Directory(Paths.document, 'comics');

/** Lets a screen show "3 of 12" and stop a long import: set `cancel.cancelled` and the import ends after the file it is on. */
export type ImportProgress = { onProgress?: (p: { done: number; total: number; name: string }) => void; cancel?: { cancelled: boolean } };

export type ImportOptions = {
  folderId?: string;
  /** Keep the file where it is (Drive, Dropbox…) and only remember the link. */
  sourceUri?: string;
  /** The file is a temporary copy nobody else needs (the picker's cache copy): move it instead of copying it a second time. */
  moveSource?: boolean;
  /** Size of the original file in bytes. With the name it tells whether this file is already in the library. */
  size?: number;
};

/** Runs `one` for each item, reporting progress, and stops early when asked. */
async function eachWithProgress<T>(items: T[], progress: ImportProgress, nameOf: (item: T) => string, one: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    if (progress.cancel?.cancelled) return;
    progress.onProgress?.({ done: i, total: items.length, name: nameOf(items[i]) });
    await one(items[i]);
  }
  progress.onProgress?.({ done: items.length, total: items.length, name: '' });
}

async function importFile(uri: string, name: string, result: ImportResult, opts: ImportOptions = {}, depth = 0): Promise<void> {
  if (depth === 0 && opts.size && isDuplicateSource(name, opts.size, titleOf(name))) { result.skipped.push(name); return; }
  const id = randomUUID();
  const dir = new Directory(comicsRoot(), id);
  try {
    dir.create();
    // A linked (cloud) comic's file goes to the cache, which cleans itself up; its cover stays here for good.
    const bookDir = opts.sourceUri ? cacheDirFor(id) : dir;
    if (opts.sourceUri) bookDir.create({ intermediates: true });
    const stored = new File(bookDir, 'book');
    if (opts.sourceUri) await copyFromSource(opts.sourceUri, stored.uri);
    else if (opts.moveSource) {
      // A rename, not a second multi-gigabyte copy; if the move isn't possible it falls back to copying.
      try { await new File(uri).move(stored); } catch { await new File(uri).copy(stored); }
    } else await new File(uri).copy(stored); // async in SDK 57: opening before it resolves reads a partial file
    let source;
    try {
      source = await openComicSource(stored.uri, `import-${id}`);
    } catch (e) {
      // A plain zip with no pages of its own may be a bundle of comics: import each one inside.
      if (e instanceof ComicOpenError && e.code === 'no-pages' && depth === 0) {
        // Only zips can hold nested comics; anything else keeps its original "no pages" error.
        let nested: string[] = [];
        try { nested = listNestedComics(stored.uri); } catch { /* not a zip */ }
        if (nested.length) {
          for (const entry of nested) {
            const tmp = new File(Paths.cache, `nested-${randomUUID()}`);
            try { extractNestedComic(stored.uri, entry, tmp); await importFile(tmp.uri, entry.split('/').pop() ?? entry, result, { ...opts, sourceUri: undefined }, depth + 1); }
            finally { try { if (tmp.exists) tmp.delete(); } catch { /* ignore */ } }
          }
          dir.delete(); try { if (bookDir.exists) bookDir.delete(); } catch { /* cache */ }
          return;
        }
      }
      throw e;
    }
    let coverPath: string | null = null;
    try {
      const first = new File(await source.getPageUri(0));
      const cover = new File(dir, `cover.${first.extension.replace('.', '') || 'jpg'}`);
      await first.copy(cover);
      coverPath = cover.uri;
    } catch { /* a missing cover is not fatal */ }
    // ComicInfo.xml gives a real title, series, writer and the manga (right-to-left) hint.
    const xml = await source.readComicInfo();
    const info = xml ? parseComicInfo(xml) : {};
    insertReaderComic({
      id, title: displayTitle(info, titleOf(name)), path: stored.uri, format: source.format, pageCount: source.pageCount, coverPath,
      series: info.series ?? null, issue: info.number ?? null, writer: info.writer ?? null, folderId: opts.folderId ?? null,
      mode: info.rtl ? 'rtl' : 'ltr', sourceUri: opts.sourceUri ?? null, sizeBytes: (() => { try { return new File(stored.uri).size ?? null; } catch { return null; } })(), sourceKey: depth === 0 && opts.size ? sourceKeyOf(name, opts.size) : null,
    });
    // Into the library too, owned digitally — and into the catalog if it isn't there yet.
    try { linkReaderComic({ id, title: displayTitle(info, titleOf(name)), series: info.series ?? null, writer: info.writer ?? null, coverPath, workId: null }); } catch { /* the file is still readable without the link */ }
    source.close();
    // A linked comic's file sits in the cache: keep the cache within its limit as we go, not only when something is read.
    if (opts.sourceUri) trimCloudCache(id);
    result.imported.push(name);
  } catch (e) {
    try { if (dir.exists) dir.delete(); } catch { /* ignore */ }
    try { if (opts.sourceUri) cacheDirFor(id).delete(); } catch { /* ignore */ }
    result.failed.push({ name, reason: e instanceof ComicOpenError ? e.message : 'Could not import this file.' });
  }
}

/** Pick one or more files and copy them into app storage (so there are no URI permissions to keep). With `folderId`, they land in that folder. */
export async function pickAndImportComics(opts: ImportOptions & ImportProgress = {}): Promise<ImportResult> {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
  const result = emptyResult();
  if (picked.canceled) return result;

  const root = comicsRoot();
  if (!root.exists) root.create({ intermediates: true });

  await eachWithProgress(picked.assets, opts, (a) => a.name, async (asset) => {
    try { await importFile(asset.uri, asset.name, result, { folderId: opts.folderId, moveSource: true, size: asset.size }); }
    finally { try { const tmp = new File(asset.uri); if (tmp.exists) tmp.delete(); } catch { /* cache copy */ } }
  });
  // Files the picker copied but we stopped before reaching.
  if (opts.cancel?.cancelled) for (const asset of picked.assets) { try { const tmp = new File(asset.uri); if (tmp.exists) tmp.delete(); } catch { /* cache copy */ } }
  return result;
}

/** Pick comics from Drive, Dropbox or any cloud app and keep them THERE: only a link, the cover and the page count stay on the phone. */
export async function pickAndLinkComics(opts: Pick<ImportOptions, 'folderId'> & ImportProgress = {}): Promise<ImportResult> {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: false });
  const result = emptyResult();
  if (picked.canceled) return result;
  const root = comicsRoot();
  if (!root.exists) root.create({ intermediates: true });
  await eachWithProgress(picked.assets, opts, (a) => a.name, async (asset) => {
    // Without this the app forgets the file the moment it closes: Android keeps the permission, iOS keeps a bookmark.
    let sourceUri = asset.uri;
    try {
      const native = optionalNative();
      if (Platform.OS === 'ios') {
        const bookmark = native?.makeBookmark?.(asset.uri);
        if (!bookmark) { result.failed.push({ name: asset.name, reason: 'This cloud app doesn’t let ComicPill keep a link. Use “Import from Files” instead.' }); return; }
        sourceUri = BOOKMARK_PREFIX + bookmark;
      } else native?.persistUriPermission?.(asset.uri);
    } catch { /* some providers don't offer it; the link then lasts for this session */ }
    await importFile(asset.uri, asset.name, result, { folderId: opts.folderId, sourceUri, size: asset.size });
  });
  return result;
}

/** Delete several comics from the device at once. */
export function removeComics(ids: string[]): void { for (const id of ids) removeComic(id); }

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
      const sourceUri = bookmark ? `${BOOKMARK_PREFIX}${bookmark}|${path.join('/')}` : file.uri;
      const id = randomUUID(); const title = titleOf(file.name);
      insertReaderComic({
        id, title, path: cachedFileFor(id).uri, format: FORMAT_OF[file.extension.replace('.', '').toLowerCase()] ?? 'cbz', pageCount: 0, coverPath: null,
        folderId: folderFor(path.slice(0, -1)), sizeBytes: size ?? null, sourceUri, sourceKey: size ? sourceKeyOf(file.name, size) : null,
      });
      try { linkReaderComic({ id, title, series: null, writer: null, coverPath: null, workId: null }); } catch { /* readable without the library link */ }
      result.imported.push(file.name);
    } catch { result.failed.push({ name: file.name, reason: 'Could not link this file.' }); }
  });
  return result;
}

/** Read the cover, page count and details of linked comics that haven't been looked at yet, one at a time. Each file is fetched, read, then released. */
export async function prepareLinkedComics(opts: ImportProgress = {}): Promise<ImportResult> {
  const result = emptyResult();
  const root = comicsRoot();
  if (!root.exists) root.create({ intermediates: true });
  await eachWithProgress(unpreparedLinkIds(), opts, (id) => getReaderComic(id)?.title ?? '', async (id) => {
    const comic = getReaderComic(id);
    if (!comic?.sourceUri) return;
    const wasCached = isCached(id);
    try {
      const source = await openComicSource(await ensureLocalCopy(comic), `prepare-${id}`);
      try {
        let coverPath: string | null = null;
        try {
          const dir = new Directory(root, id);
          if (!dir.exists) dir.create({ intermediates: true });
          const first = new File(await source.getPageUri(0));
          const cover = new File(dir, `cover.${first.extension.replace('.', '') || 'jpg'}`);
          await first.copy(cover);
          coverPath = cover.uri;
        } catch { /* a missing cover is not fatal */ }
        const xml = await source.readComicInfo();
        const info = xml ? parseComicInfo(xml) : {};
        const title = displayTitle(info, comic.title);
        const mode: ReaderMode | null = info.rtl ? 'rtl' : null;
        fillInComic(id, { title, pageCount: source.pageCount, coverPath, series: info.series ?? null, issue: info.number ?? null, writer: info.writer ?? null, mode });
        try { const workId = linkReaderComic({ id, title, series: info.series ?? null, writer: info.writer ?? null, coverPath, workId: comic.workId }); if (coverPath) setWorkCover(workId, coverPath); } catch { /* the shelf already has it */ }
        result.imported.push(title);
      } finally { source.close(); }
    } catch (e) {
      result.failed.push({ name: comic.title, reason: e instanceof ComicOpenError ? e.message : 'Could not fetch or read this comic.' });
    } finally {
      if (!wasCached) freeSpaceFor(id); // a bulk pass must not fill the cache with files nobody asked to read
    }
  });
  return result;
}
