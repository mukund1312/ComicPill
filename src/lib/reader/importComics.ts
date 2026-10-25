import * as DocumentPicker from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { Directory, File, Paths } from 'expo-file-system';
import { ComicOpenError, openComicSource } from './ComicSource';
import { deleteReaderComic, getReaderComic, insertReaderComic } from './readerLibrary';

export type ImportResult = { imported: string[]; failed: Array<{ name: string; reason: string }> };

const titleOf = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || name;

const comicsRoot = () => new Directory(Paths.document, 'comics');

/** Pick one or more files and copy them into app storage (so there are no URI permissions to keep). */
export async function pickAndImportComics(): Promise<ImportResult> {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
  const result: ImportResult = { imported: [], failed: [] };
  if (picked.canceled) return result;

  const root = comicsRoot();
  if (!root.exists) root.create({ intermediates: true });

  for (const asset of picked.assets) {
    const id = randomUUID();
    const dir = new Directory(root, id);
    try {
      dir.create();
      const stored = new File(dir, 'book');
      new File(asset.uri).copy(stored);
      const source = await openComicSource(stored.uri, `import-${id}`);
      let coverPath: string | null = null;
      try {
        const first = new File(await source.getPageUri(0));
        const cover = new File(dir, `cover.${first.extension.replace('.', '') || 'jpg'}`);
        first.copy(cover);
        coverPath = cover.uri;
      } catch { /* a missing cover is not fatal */ }
      insertReaderComic({ id, title: titleOf(asset.name), path: stored.uri, format: source.format, pageCount: source.pageCount, coverPath });
      source.close();
      result.imported.push(asset.name);
    } catch (e) {
      try { if (dir.exists) dir.delete(); } catch { /* ignore */ }
      result.failed.push({ name: asset.name, reason: e instanceof ComicOpenError ? e.message : 'Could not import this file.' });
    } finally {
      try { const tmp = new File(asset.uri); if (tmp.exists) tmp.delete(); } catch { /* cache copy */ }
    }
  }
  return result;
}

export function removeComic(id: string): void {
  const comic = getReaderComic(id);
  if (comic) { try { const dir = new File(comic.path).parentDirectory; if (dir.exists) dir.delete(); } catch { /* ignore */ } }
  deleteReaderComic(id);
}
