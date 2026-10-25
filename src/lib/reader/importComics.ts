import * as DocumentPicker from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { Directory, File, Paths } from 'expo-file-system';
import { ComicOpenError, extractNestedComic, listNestedComics, openComicSource } from './ComicSource';
import { parseComicInfo, displayTitle } from './formats/comicInfo';
import { createFolder, deleteReaderComic, getReaderComic, insertReaderComic } from './readerLibrary';

export type ImportResult = { imported: string[]; failed: Array<{ name: string; reason: string }> };

const titleOf = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || name;

const comicsRoot = () => new Directory(Paths.document, 'comics');

export type ImportOptions = { folderId?: string };

async function importFile(uri: string, name: string, result: ImportResult, opts: ImportOptions = {}, depth = 0): Promise<void> {
  const id = randomUUID();
  const dir = new Directory(comicsRoot(), id);
  try {
    dir.create();
    const stored = new File(dir, 'book');
    await new File(uri).copy(stored); // async in SDK 57: opening before it resolves reads a partial file
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
            try { extractNestedComic(stored.uri, entry, tmp); await importFile(tmp.uri, entry.split('/').pop() ?? entry, result, opts, depth + 1); }
            finally { try { if (tmp.exists) tmp.delete(); } catch { /* ignore */ } }
          }
          dir.delete();
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
      mode: info.rtl ? 'rtl' : 'ltr',
    });
    source.close();
    result.imported.push(name);
  } catch (e) {
    try { if (dir.exists) dir.delete(); } catch { /* ignore */ }
    result.failed.push({ name, reason: e instanceof ComicOpenError ? e.message : 'Could not import this file.' });
  }
}

/** Pick one or more files and copy them into app storage (so there are no URI permissions to keep). With `folderId`, they land in that folder. */
export async function pickAndImportComics(opts: ImportOptions = {}): Promise<ImportResult> {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
  const result: ImportResult = { imported: [], failed: [] };
  if (picked.canceled) return result;

  const root = comicsRoot();
  if (!root.exists) root.create({ intermediates: true });

  for (const asset of picked.assets) {
    try { await importFile(asset.uri, asset.name, result, opts); }
    finally { try { const tmp = new File(asset.uri); if (tmp.exists) tmp.delete(); } catch { /* cache copy */ } }
  }
  return result;
}

export function removeComic(id: string): void {
  const comic = getReaderComic(id);
  if (comic) { try { const dir = new File(comic.path).parentDirectory; if (dir.exists) dir.delete(); } catch { /* ignore */ } }
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
export async function pickAndImportFolder(): Promise<ImportResult> {
  const result: ImportResult = { imported: [], failed: [] };
  let dir: Directory;
  try { dir = await Directory.pickDirectoryAsync(); } catch { return result; } // cancelled
  const files = collectComicFiles(dir);
  const root = comicsRoot();
  if (!root.exists) root.create({ intermediates: true });
  const folderId = files.length ? createFolder(dir.name || 'Imported') : undefined;
  for (const f of files) await importFile(f.uri, f.name, result, { folderId });
  return result;
}

/** Import a file that is already on the phone (a download, say) — same path as the picker, one file. */
export async function importLocalFile(uri: string, name: string, opts: ImportOptions = {}): Promise<ImportResult> {
  const result: ImportResult = { imported: [], failed: [] };
  const root = comicsRoot();
  if (!root.exists) root.create({ intermediates: true });
  await importFile(uri, name, result, opts);
  return result;
}
