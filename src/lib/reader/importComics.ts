import * as DocumentPicker from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { Directory, File, Paths } from 'expo-file-system';
import { ComicOpenError, extractNestedComic, listNestedComics, openComicSource } from './ComicSource';
import { deleteReaderComic, getReaderComic, insertReaderComic } from './readerLibrary';

export type ImportResult = { imported: string[]; failed: Array<{ name: string; reason: string }> };

const titleOf = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || name;

const comicsRoot = () => new Directory(Paths.document, 'comics');

async function importFile(uri: string, name: string, result: ImportResult, depth = 0): Promise<void> {
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
            try { extractNestedComic(stored.uri, entry, tmp); await importFile(tmp.uri, entry.split('/').pop() ?? entry, result, depth + 1); }
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
    insertReaderComic({ id, title: titleOf(name), path: stored.uri, format: source.format, pageCount: source.pageCount, coverPath });
    source.close();
    result.imported.push(name);
  } catch (e) {
    try { if (dir.exists) dir.delete(); } catch { /* ignore */ }
    result.failed.push({ name, reason: e instanceof ComicOpenError ? e.message : 'Could not import this file.' });
  }
}

/** Pick one or more files and copy them into app storage (so there are no URI permissions to keep). */
export async function pickAndImportComics(): Promise<ImportResult> {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
  const result: ImportResult = { imported: [], failed: [] };
  if (picked.canceled) return result;

  const root = comicsRoot();
  if (!root.exists) root.create({ intermediates: true });

  for (const asset of picked.assets) {
    try { await importFile(asset.uri, asset.name, result); }
    finally { try { const tmp = new File(asset.uri); if (tmp.exists) tmp.delete(); } catch { /* cache copy */ } }
  }
  return result;
}

export function removeComic(id: string): void {
  const comic = getReaderComic(id);
  if (comic) { try { const dir = new File(comic.path).parentDirectory; if (dir.exists) dir.delete(); } catch { /* ignore */ } }
  deleteReaderComic(id);
}
