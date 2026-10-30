// Put a whole comic-server library (Komga, Kavita…) on the shelf the way Kindle shows a library: every comic with its cover and name, nothing
// downloaded. A comic comes across when it is opened, within how many may be kept on the device at once.
import { randomUUID } from 'expo-crypto';
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { Directory, File } from 'expo-file-system';
import { authHeaders } from '../opds/client';
import { crawlCatalog, type FoundComic } from '../opds/crawl';
import { groupSeries, looksFlat } from '../opds/seriesName';
import { opdsSourceFor } from '../opds/source';
import type { OpdsServer } from '../opds/servers';
import { cachedFileFor } from './cloudCache';
import { saveCover } from './cover';
import { linkReaderComic } from './libraryLink';
import { sqlite } from '../db/client';
import { addWorksToCollection, createCollection, createFolder, hasSourceKey, insertReaderComic } from './readerLibrary';
import { comicsRoot, eachWithProgress, emptyResult, FORMAT_OF, reasonOf, type ImportProgress, type ImportResult } from './importComics';

/** The file's own name when the server's link carries it (Komga's does), else the title it shows. */
const nameOf = ({ entry, acquisition }: FoundComic): string => {
  const m = /\/file\/([^/?#]+)/.exec(acquisition.href);
  if (m) { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }
  return entry.title;
};

/** A server series that is really one big folder of many series gets split by the series each comic's name says; real series are left as they are. */
export function regroupFlatSeries(found: FoundComic[]): FoundComic[] {
  const byPath = new Map<string, FoundComic[]>();
  for (const f of found) { const k = f.path.join('\u0000'); byPath.set(k, [...(byPath.get(k) ?? []), f]); }
  const out: FoundComic[] = [];
  for (const list of byPath.values()) {
    const groups = groupSeries(list.map(nameOf));
    if (!looksFlat(groups)) { out.push(...list); continue; }
    for (const f of list) out.push({ ...f, path: [...f.path, groups.get(nameOf(f)) as string] });
  }
  return out;
}

/** Put every comic from the server's catalog on the shelf, with its cover, filed in folders like the server's series. Comics already added are skipped. */
export async function linkOpdsLibrary(server: OpdsServer, startUrl: string, opts: { parentId?: string } & ImportProgress = {}): Promise<ImportResult> {
  const result = emptyResult();
  let found: FoundComic[];
  try { found = regroupFlatSeries(await crawlCatalog(server, startUrl, opts)); }
  catch (e) { result.failed.push({ name: server.name, reason: reasonOf(e, 'Could not read the catalog') }); return result; }
  if (!found.length) { result.failed.push({ name: server.name, reason: 'No comics were found in this catalog.' }); return result; }

  const root = comicsRoot();
  if (!root.exists) root.create({ intermediates: true });
  const headers = await authHeaders(server);
  const folderIds = new Map<string, string>();
  const folderFor = (names: string[]): string => {
    let parent: string | null = opts.parentId ?? null; let key = '';
    for (const name of [server.name, ...names]) {
      key += `/${name}`;
      let id = folderIds.get(key);
      if (!id) { id = createFolder(name, parent); folderIds.set(key, id); }
      parent = id;
    }
    return parent as string;
  };

  // My Collection shows the same grouping: a collection for the server, a collection inside it for each series or folder, the comics inside that.
  const collectionIds = new Map<string, string>();
  const collectionFor = (names: string[]): string => {
    let parent: string | null = null; let key = '';
    for (const name of [server.name, ...names]) {
      key += `/${name}`;
      let id = collectionIds.get(key);
      if (!id) { id = createCollection(name, parent); collectionIds.set(key, id); }
      parent = id;
    }
    return parent as string;
  };
  const fileInCollection = (workId: string | null | undefined, path: string[]) => { if (workId) addWorksToCollection(collectionFor(path), [workId]); };

  await eachWithProgress(found, opts, (f) => f.entry.title, async ({ entry, acquisition, path }) => {
    const sourceKey = `opds:${server.id}:${entry.id}`;
    if (hasSourceKey(sourceKey)) {
      // Added on an earlier run (perhaps before folders were kept in My Collection): make sure it is filed in its series.
      try { fileInCollection(sqlite.getFirstSync<{ work_id: string | null }>('SELECT work_id FROM reader_comics WHERE source_key = ?', sourceKey)?.work_id, path); } catch { /* the comic is there either way */ }
      result.skipped.push(entry.title); return;
    }
    const id = randomUUID();
    let coverPath: string | null = null;
    // The server's own thumbnail is the cover; nothing of the comic itself is fetched here.
    if (entry.thumb) {
      const dir = new Directory(root, id);
      try {
        dir.create({ intermediates: true });
        const temp = new File(dir, 'thumb.tmp');
        await File.downloadFileAsync(entry.thumb, temp, { headers, idempotent: true });
        coverPath = await saveCover(temp.uri, dir);
        try { temp.delete(); } catch { /* it is only a temporary file */ }
      } catch { coverPath = null; try { if (dir.exists) dir.delete(); } catch { /* nothing to clean */ } }
    }
    try {
      insertReaderComic({
        id, title: entry.title, path: cachedFileFor(id).uri, format: FORMAT_OF[acquisition.ext ?? 'cbz'] ?? 'cbz', pageCount: 0, coverPath,
        writer: entry.authors[0] ?? null, folderId: folderFor(path), sizeBytes: acquisition.size ?? null,
        sourceUri: opdsSourceFor(server.id, server.url, acquisition.href), sourceKey,
      });
      try { fileInCollection(linkReaderComic({ id, title: entry.title, series: path[path.length - 1] ?? null, writer: entry.authors[0] ?? null, coverPath, workId: null }), path); } catch { /* readable without the library link */ }
      result.imported.push(entry.title);
    } catch { result.failed.push({ name: entry.title, reason: 'Could not add this comic.' }); }
  }, 'Adding comics');
  return result;
}
