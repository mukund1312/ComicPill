// The key abstraction: the reader asks for page N and never cares which container it came from.
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { detectKind } from './formats/detect';
import { extensionOf, selectImageEntries } from './formats/entries';
import { findImageRef, parseContainer, parseOpf, resolvePath } from './formats/epub';
import { readImageSize, type PageSize } from './formats/imageSize';
import { ComicOpenError } from './errors';
import { nativeArchive, translateNativeError, type NativeKind } from './nativeArchive';
import { ZipReader } from './ZipReader';

export { ComicOpenError } from './errors';
export type { PageSize } from './formats/imageSize';

export type ComicFormat = 'cbz' | 'epub' | 'cbr' | 'cb7' | 'pdf';

export type ComicSource = {
  format: ComicFormat;
  pageCount: number;
  /** True when `scanSizes` is worth running (every format except ones with no size source). */
  cheapSizes: boolean;
  /** Shapes of all pages, read without extracting them. Index-aligned; null where unreadable. */
  scanSizes(isLive: () => boolean): Promise<Array<PageSize | null>>;
  /** file:// uri of page `index`, extracted to the cache dir on first request. */
  getPageUri(index: number): Promise<string>;
  getPageSize(index: number): Promise<PageSize | null>;
  /** Tell the source where the reader is so cache eviction never drops nearby pages. */
  setFocus(index: number): void;
  /** Raw ComicInfo.xml text if the archive carries one. */
  readComicInfo(): Promise<string | null>;
  close(): void;
};

const MAX_CACHED_PAGES = 40;
/** PDF pages are rasterised this wide: sharp on a phone, ~12 MB per page bitmap while rendering. */
const PDF_RENDER_WIDTH = 1400;
const FOCUS_RADIUS = 4;
const decoder = new TextDecoder();

type Backend = {
  format: ComicFormat;
  pages: string[];
  cheapSizes: boolean;
  extract(entry: string, dest: File): Promise<void>;
  head?(entry: string): Uint8Array;
  /** Whole-archive size scan for backends where per-entry header reads would be quadratic. */
  allSizes?(): Promise<Array<PageSize | null>>;
  /** ComicInfo.xml, when present. */
  readInfo?(): Promise<string | null>;
  dispose(): void;
};

function makeSource(backend: Backend, cacheKey: string): ComicSource {
  const dir = new Directory(Paths.cache, 'reader', cacheKey);
  if (!dir.exists) dir.create({ intermediates: true });
  const inflight = new Map<number, Promise<string>>();
  const order: number[] = []; // extraction order, oldest first
  const sizes = new Map<number, PageSize | null>();
  let focus = 0;

  const fileFor = (index: number) => new File(dir, `${index}.${extensionOf(backend.pages[index])}`);

  const evict = () => {
    while (order.length > MAX_CACHED_PAGES) {
      const at = order.findIndex((i) => Math.abs(i - focus) > FOCUS_RADIUS);
      if (at < 0) return;
      const [victim] = order.splice(at, 1);
      inflight.delete(victim);
      try { const f = fileFor(victim); if (f.exists) f.delete(); } catch { /* cache is disposable */ }
    }
  };

  return {
    format: backend.format,
    pageCount: backend.pages.length,
    cheapSizes: backend.cheapSizes,
    async scanSizes(isLive) {
      if (backend.allSizes) return backend.allSizes();
      const out: Array<PageSize | null> = [];
      for (let i = 0; i < backend.pages.length; i++) {
        if (!isLive()) return out;
        out.push(await this.getPageSize(i));
        if (i % 25 === 24) await new Promise((r) => setTimeout(r, 0)); // keep the UI thread breathing
      }
      return out;
    },
    getPageUri(index) {
      const existing = inflight.get(index);
      if (existing) return existing;
      const task = (async () => {
        const out = fileFor(index);
        if (!out.exists) await backend.extract(backend.pages[index], out);
        order.push(index); evict();
        return out.uri;
      })();
      inflight.set(index, task);
      task.catch(() => inflight.delete(index));
      return task;
    },
    async getPageSize(index) {
      if (sizes.has(index)) return sizes.get(index) ?? null;
      let size: PageSize | null = null;
      try { if (backend.head) size = readImageSize(backend.head(backend.pages[index])); } catch { size = null; }
      sizes.set(index, size);
      return size;
    },
    setFocus(index) { focus = index; },
    readComicInfo: async () => { try { return (await backend.readInfo?.()) ?? null; } catch { return null; } },
    close() {
      inflight.clear(); order.length = 0;
      backend.dispose();
      try { if (dir.exists) dir.delete(); } catch { /* cache is disposable */ }
    },
  };
}

function epubPages(zip: ZipReader): string[] {
  const containerPath = 'META-INF/container.xml';
  const opfPath = parseContainer(decoder.decode(zip.readEntry(containerPath)));
  if (!opfPath || !zip.has(opfPath)) throw new ComicOpenError('EPUB package file not found.');
  const { manifest, spine } = parseOpf(decoder.decode(zip.readEntry(opfPath)));
  const pages: string[] = [];
  for (const idref of spine) {
    const item = manifest[idref];
    if (!item) continue;
    const full = resolvePath(opfPath, item.href);
    if (item.mediaType.startsWith('image/')) { if (zip.has(full)) pages.push(full); continue; }
    if (!zip.has(full)) continue;
    const ref = findImageRef(decoder.decode(zip.readEntry(full)));
    if (!ref) continue;
    const imagePath = resolvePath(full, ref);
    if (zip.has(imagePath)) pages.push(imagePath);
  }
  return pages;
}

const writeBytes = (dest: File, bytes: Uint8Array) => { dest.create(); dest.write(bytes); };

function zipBackend(file: File): Backend {
  const zip = ZipReader.open(file);
  try {
    const isEpub = zip.has('META-INF/container.xml');
    const pages = isEpub ? epubPages(zip) : selectImageEntries(zip.names());
    if (pages.length === 0) throw new ComicOpenError('No pages found in this file.', 'no-pages');
    return {
      format: isEpub ? 'epub' : 'cbz', pages, cheapSizes: true,
      extract: async (entry, dest) => writeBytes(dest, zip.readEntry(entry)),
      head: (entry) => zip.readEntryHead(entry),
      readInfo: async () => { const n = zip.names().find((x) => x.toLowerCase() === 'comicinfo.xml'); return n ? decoder.decode(zip.readEntry(n)) : null; },
      dispose: () => zip.close(),
    };
  } catch (e) { zip.close(); throw e; }
}

const toSize = (wh: number[]): PageSize | null => (wh[0] > 0 && wh[1] > 0 ? { width: wh[0], height: wh[1] } : null);

async function pdfBackend(file: File): Promise<Backend> {
  const native = nativeArchive('pdf');
  let sizes: Array<PageSize | null>;
  try { sizes = (await native.pdfPageSizes(file.uri)).map(toSize); } catch (e) { throw translateNativeError(e); }
  if (sizes.length === 0) throw new ComicOpenError('No pages found in this file.', 'no-pages');
  // Page "names" are just indices with a .jpg extension, so the cache layer treats them like any image.
  const pages = sizes.map((_, i) => `${i}.jpg`);
  return {
    format: 'pdf', pages, cheapSizes: true,
    allSizes: async () => sizes,
    extract: async (entry, dest) => {
      try { await native.renderPdfPage(file.uri, Number.parseInt(entry, 10), dest.uri, PDF_RENDER_WIDTH); } catch (e) { throw translateNativeError(e); }
    },
    dispose: () => undefined,
  };
}

async function nativeBackend(file: File, kind: NativeKind): Promise<Backend> {
  const native = nativeArchive(kind);
  let names: string[];
  try { names = await native.listEntries(file.uri, kind); } catch (e) { throw translateNativeError(e); }
  const pages = selectImageEntries(names);
  if (pages.length === 0) throw new ComicOpenError('No pages found in this file.', 'no-pages');
  return {
    format: kind === 'rar' ? 'cbr' : 'cb7', pages, cheapSizes: true,
    allSizes: async () => {
      try { return (await native.imageSizes(file.uri, kind, pages)).map(toSize); } catch { return pages.map(() => null); }
    },
    readInfo: async () => {
      const entry = names.find((n) => n.toLowerCase() === 'comicinfo.xml');
      if (!entry) return null;
      const tmp = new File(Paths.cache, `info-${Date.now()}.xml`);
      try { await native.extractEntry(file.uri, kind, entry, tmp.uri); return await tmp.text(); } finally { try { if (tmp.exists) tmp.delete(); } catch { /* temp */ } }
    },
    extract: async (entry, dest) => {
      try { await native.extractEntry(file.uri, kind, entry, dest.uri); } catch (e) { throw translateNativeError(e); }
    },
    dispose: () => undefined,
  };
}

/** Open a comic file. The container is decided by magic bytes, never the extension. */
export async function openComicSource(fileUri: string, cacheKey: string): Promise<ComicSource> {
  const file = new File(fileUri);
  if (!file.exists) throw new ComicOpenError('File not found.');
  const handle = file.open(FileMode.ReadOnly);
  let head: Uint8Array;
  try { head = handle.readBytes(8); } finally { handle.close(); }
  const kind = detectKind(head);

  let backend: Backend;
  if (kind === 'zip') backend = zipBackend(file);
  else if (kind === 'rar4') backend = await nativeBackend(file, 'rar');
  else if (kind === 'sevenzip') backend = await nativeBackend(file, '7z');
  else if (kind === 'rar5') throw new ComicOpenError('RAR5 archives are not supported yet. Re-save the comic as CBZ.');
  else if (kind === 'pdf') backend = await pdfBackend(file);
  else throw new ComicOpenError('Unrecognised file type.');
  return makeSource(backend, cacheKey);
}

const NESTED_COMIC = ['cbz', 'cbr', 'cb7', 'zip', 'epub'];

/** Comic files packed inside a plain zip (a zip of CBZs, say). Empty unless the zip has no pages of its own. */
export function listNestedComics(fileUri: string): string[] {
  const zip = ZipReader.open(new File(fileUri));
  try { return zip.names().filter((n) => !n.endsWith('/') && !n.split('/').some((p) => p.startsWith('.') || p === '__MACOSX') && NESTED_COMIC.includes(extensionOf(n))); }
  finally { zip.close(); }
}

export function extractNestedComic(fileUri: string, entry: string, dest: File): void {
  const zip = ZipReader.open(new File(fileUri));
  try { writeBytes(dest, zip.readEntry(entry)); } finally { zip.close(); }
}
