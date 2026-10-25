// The key abstraction: the reader asks for page N and never cares which container it came from.
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { Directory, File, Paths } from 'expo-file-system';
import { unzipSync } from 'fflate';
import { detectKind } from './formats/detect';
import { extensionOf, selectImageEntries } from './formats/entries';
import { findImageRef, parseContainer, parseOpf, resolvePath } from './formats/epub';

export type ComicFormat = 'cbz' | 'epub';

export class ComicOpenError extends Error {}

export type ComicSource = {
  format: ComicFormat;
  pageCount: number;
  /** file:// uri of page `index`, decoded to the cache dir on first request. */
  getPageUri(index: number): Promise<string>;
  close(): void;
};

const MIME_FREE_EXT: Record<string, string> = { jpeg: 'jpg' };

function readEntry(data: Uint8Array, name: string): Uint8Array {
  try {
    const out = unzipSync(data, { filter: (f) => f.name === name });
    const bytes = out[name];
    if (!bytes) throw new Error('missing');
    return bytes;
  } catch {
    throw new ComicOpenError(`Could not read "${name}" — the file may be corrupt or password-protected.`);
  }
}

function listEntries(data: Uint8Array): string[] {
  const names: string[] = [];
  try {
    unzipSync(data, { filter: (f) => { names.push(f.name); return false; } });
  } catch {
    throw new ComicOpenError('This file is corrupt or not a valid archive.');
  }
  return names;
}

const decoder = new TextDecoder();

function epubPages(data: Uint8Array, names: string[]): string[] {
  const nameSet = new Set(names);
  const containerPath = 'META-INF/container.xml';
  if (!nameSet.has(containerPath)) throw new ComicOpenError('EPUB is missing META-INF/container.xml.');
  const opfPath = parseContainer(decoder.decode(readEntry(data, containerPath)));
  if (!opfPath || !nameSet.has(opfPath)) throw new ComicOpenError('EPUB package file not found.');
  const { manifest, spine } = parseOpf(decoder.decode(readEntry(data, opfPath)));
  const pages: string[] = [];
  for (const idref of spine) {
    const item = manifest[idref];
    if (!item) continue;
    const full = resolvePath(opfPath, item.href);
    if (item.mediaType.startsWith('image/')) { if (nameSet.has(full)) pages.push(full); continue; }
    if (!nameSet.has(full)) continue;
    const ref = findImageRef(decoder.decode(readEntry(data, full)));
    if (!ref) continue;
    const imagePath = resolvePath(full, ref);
    if (nameSet.has(imagePath)) pages.push(imagePath);
  }
  return pages;
}

function pageCacheDir(key: string): Directory {
  const dir = new Directory(Paths.cache, 'reader', key);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * Open a comic file. Format is decided by magic bytes, not extension.
 * Whole archive is held in memory (fflate), pages are inflated one at a time — fine for
 * typical CBZ sizes; very large files will want a streaming reader later.
 */
export async function openComicSource(fileUri: string, cacheKey: string): Promise<ComicSource> {
  const file = new File(fileUri);
  if (!file.exists) throw new ComicOpenError('File not found.');
  const data = await file.bytes();
  const kind = detectKind(data.subarray(0, 8));
  if (kind === 'rar5') throw new ComicOpenError('RAR5 archives are not supported yet. Re-save the comic as CBZ.');
  if (kind === 'rar4') throw new ComicOpenError('CBR (RAR) needs a native module that is not built yet. Re-save as CBZ for now.');
  if (kind === 'sevenzip') throw new ComicOpenError('CB7 (7z) needs a native module that is not built yet. Re-save as CBZ for now.');
  if (kind === 'pdf') throw new ComicOpenError('PDF needs a native renderer that is not built yet.');
  if (kind !== 'zip') throw new ComicOpenError('Unrecognised file type.');

  const names = listEntries(data);
  const isEpub = names.includes('META-INF/container.xml');
  const pages = isEpub ? epubPages(data, names) : selectImageEntries(names);
  if (pages.length === 0) throw new ComicOpenError('No pages found in this file.');

  const dir = pageCacheDir(cacheKey);
  const inflight = new Map<number, Promise<string>>();

  return {
    format: isEpub ? 'epub' : 'cbz',
    pageCount: pages.length,
    getPageUri(index) {
      const cached = inflight.get(index);
      if (cached) return cached;
      const task = (async () => {
        const entry = pages[index];
        const ext = extensionOf(entry); const out = new File(dir, `${index}.${MIME_FREE_EXT[ext] ?? ext}`);
        if (!out.exists) { out.create(); out.write(readEntry(data, entry)); }
        return out.uri;
      })();
      inflight.set(index, task);
      task.catch(() => inflight.delete(index));
      return task;
    },
    close() {
      inflight.clear();
      try { if (dir.exists) dir.delete(); } catch { /* cache is disposable */ }
    },
  };
}
