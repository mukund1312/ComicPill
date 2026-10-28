import { sqlite } from '../db/client';
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { Paths } from 'expo-file-system';
import { rebase } from './portablePath';
import type { Lock } from './lock';
import { canMoveFolders } from './folderTree';
import { sourceKeyOf } from './sourceKey';
import type { ShelfComic } from './shelf';

export type ReaderMode = 'ltr' | 'rtl' | 'webtoon';

export type ReaderComic = ShelfComic & {
  path: string; format: string; coverPath: string | null; mode: ReaderMode;
  issue: string | null; folderId: string | null; presetId: string | null;
  /** Has a password. Whether it is open right now is tracked in `lock.ts`. */
  locked: boolean;
  /** The catalog / library entry this file is also known as. */
  workId: string | null;
  /** Size of the stored file in bytes, when known. */
  sizeBytes: number | null;
  /** Set when the file stays in a cloud app (Drive, Dropbox…) and is only fetched when you read it. */
  sourceUri: string | null;
  /** Webtoon only: how far into the progress page you had scrolled, 0..1. */
  progressOffset: number;
  sizes: Array<{ width: number; height: number } | null> | null;
};

type Row = {
  id: string; title: string; path: string; format: string; page_count: number; cover_path: string | null;
  added_at: number; last_read_at: number | null; progress_page: number; mode: string;
  progress_offset: number; sizes_json: string | null;
  series: string | null; issue: string | null; writer: string | null; folder_id: string | null; preset_id: string | null;
  lock_hash: string | null; work_id: string | null; size_bytes: number | null; source_uri: string | null;
};

const parseSizes = (json: string | null): ReaderComic['sizes'] => {
  try { const v = json ? JSON.parse(json) : null; return Array.isArray(v) ? v : null; } catch { return null; }
};

// Today's app folders, with the trailing slash. Computed once: they don't change while the app runs.
const ROOTS: Record<string, string> = {
  '/Documents/': Paths.document.uri.endsWith('/') ? Paths.document.uri : `${Paths.document.uri}/`,
  '/Library/Caches/': Paths.cache.uri.endsWith('/') ? Paths.cache.uri : `${Paths.cache.uri}/`,
};
/** A saved file address, pointed at this install's app folder (iOS changes it on update/reinstall). */
const here = (p: string | null): string | null => (p ? rebase(p, ROOTS) : p);

const map = (r: Row): ReaderComic => ({
  id: r.id, title: r.title, path: here(r.path) ?? r.path, format: r.format, pageCount: r.page_count, coverPath: here(r.cover_path),
  addedAt: r.added_at, lastReadAt: r.last_read_at, progressPage: r.progress_page, mode: r.mode as ReaderMode,
  progressOffset: r.progress_offset ?? 0, sizes: parseSizes(r.sizes_json),
  series: r.series, issue: r.issue, writer: r.writer, folderId: r.folder_id, presetId: r.preset_id, locked: !!r.lock_hash, workId: r.work_id, sizeBytes: r.size_bytes ?? null, sourceUri: r.source_uri ?? null,
});

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// ---- comics -----------------------------------------------------------------
export const listReaderComics = (): ReaderComic[] =>
  sqlite.getAllSync<Row>('SELECT * FROM reader_comics ORDER BY COALESCE(last_read_at, added_at) DESC').map(map);

export const getReaderComic = (id: string): ReaderComic | null => {
  const row = sqlite.getFirstSync<Row>('SELECT * FROM reader_comics WHERE id = ?', id);
  return row ? map(row) : null;
};

export type NewReaderComic = Pick<ReaderComic, 'id' | 'title' | 'path' | 'format' | 'pageCount' | 'coverPath'> &
  Partial<Pick<ReaderComic, 'series' | 'issue' | 'writer' | 'folderId' | 'mode' | 'sizeBytes' | 'sourceUri'>> & { /** `name|size` of the file it came from, so the same file isn't imported twice. */ sourceKey?: string | null };

export const insertReaderComic = (c: NewReaderComic): void => {
  sqlite.runSync(
    'INSERT INTO reader_comics (id, title, path, format, page_count, cover_path, added_at, series, issue, writer, folder_id, mode, size_bytes, source_uri, source_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    c.id, c.title, c.path, c.format, c.pageCount, c.coverPath, Date.now(), c.series ?? null, c.issue ?? null, c.writer ?? null, c.folderId ?? null, c.mode ?? 'ltr', c.sizeBytes ?? null, c.sourceUri ?? null, c.sourceKey ?? null,
  );
};

export { sourceKeyOf };

export const hasSourceKey = (key: string): boolean => !!sqlite.getFirstSync('SELECT 1 FROM reader_comics WHERE source_key = ? LIMIT 1', key);

/** Is this file (same name and exact size) already in the library? Comics imported before keys existed match on size and title. */
export const isDuplicateSource = (name: string, size: number, titleGuess: string): boolean =>
  !!sqlite.getFirstSync(
    'SELECT 1 FROM reader_comics WHERE source_key = ? OR (size_bytes = ? AND title = ? COLLATE NOCASE) LIMIT 1',
    sourceKeyOf(name, size), size, titleGuess,
  );

/** Linked comics whose cover and page count haven't been read yet (a folder link saves them for later). */
export const unpreparedLinkIds = (): string[] =>
  // (comics on a comic server already have their cover from the server; the rest is filled in when one is opened)
  sqlite.getAllSync<{ id: string }>("SELECT id FROM reader_comics WHERE source_uri IS NOT NULL AND source_uri NOT LIKE 'opds:%' AND page_count = 0 ORDER BY added_at").map((r) => r.id);

export const fillInComic = (id: string, f: { title: string; pageCount: number; coverPath: string | null; series: string | null; issue: string | null; writer: string | null; /** Only set when the file says so (manga); null keeps the reader's choice. */ mode: ReaderMode | null }): void => {
  sqlite.runSync('UPDATE reader_comics SET title = ?, page_count = ?, cover_path = ?, series = ?, issue = ?, writer = ?, mode = COALESCE(?, mode) WHERE id = ?', f.title, f.pageCount, f.coverPath, f.series, f.issue, f.writer, f.mode, id);
};

export const setPageCount = (id: string, pageCount: number): void => { sqlite.runSync('UPDATE reader_comics SET page_count = ? WHERE id = ? AND page_count = 0', pageCount, id); };

export const saveReaderProgress = (id: string, page: number, offset = 0): void => {
  sqlite.runSync('UPDATE reader_comics SET progress_page = ?, progress_offset = ?, last_read_at = ? WHERE id = ?', page, offset, Date.now(), id);
};

export const saveReaderSizes = (id: string, sizes: ReaderComic['sizes']): void => {
  sqlite.runSync('UPDATE reader_comics SET sizes_json = ? WHERE id = ?', JSON.stringify(sizes), id);
};

export const saveReaderMode = (id: string, mode: ReaderMode): void => {
  sqlite.runSync('UPDATE reader_comics SET mode = ? WHERE id = ?', mode, id);
};

export const setComicPreset = (id: string, presetId: string | null): void => {
  sqlite.runSync('UPDATE reader_comics SET preset_id = ? WHERE id = ?', presetId, id);
};

export const setComicFolder = (id: string, folderId: string | null): void => {
  sqlite.runSync('UPDATE reader_comics SET folder_id = ? WHERE id = ?', folderId, id);
};

/** "Mark read" jumps to the last page; "mark unread" clears progress entirely. */
export const markComic = (id: string, read: boolean, pageCount: number): void => {
  if (read) sqlite.runSync('UPDATE reader_comics SET progress_page = ?, progress_offset = 0, last_read_at = ? WHERE id = ?', Math.max(0, pageCount - 1), Date.now(), id);
  else sqlite.runSync('UPDATE reader_comics SET progress_page = 0, progress_offset = 0, last_read_at = NULL WHERE id = ?', id);
};

export const renameReaderComic = (id: string, title: string): void => { sqlite.runSync('UPDATE reader_comics SET title = ? WHERE id = ?', title.trim(), id); };

export const deleteReaderComic = (id: string): void => {
  sqlite.runSync('DELETE FROM reader_comics WHERE id = ?', id);
  sqlite.runSync('DELETE FROM reader_bookmarks WHERE comic_id = ?', id);
  sqlite.runSync('DELETE FROM reader_collection_items WHERE comic_id = ?', id);
  sqlite.runSync('DELETE FROM reader_panels WHERE comic_id = ?', id);
};

// ---- bookmarks --------------------------------------------------------------
export const listBookmarks = (comicId: string): number[] =>
  sqlite.getAllSync<{ page: number }>('SELECT page FROM reader_bookmarks WHERE comic_id = ? ORDER BY page', comicId).map((r) => r.page);

/** Adds the bookmark if absent, removes it if present. Returns whether the page is bookmarked now. */
export const toggleBookmark = (comicId: string, page: number): boolean => {
  const exists = sqlite.getFirstSync('SELECT 1 FROM reader_bookmarks WHERE comic_id = ? AND page = ?', comicId, page);
  if (exists) { sqlite.runSync('DELETE FROM reader_bookmarks WHERE comic_id = ? AND page = ?', comicId, page); return false; }
  sqlite.runSync('INSERT INTO reader_bookmarks (comic_id, page, created_at) VALUES (?, ?, ?)', comicId, page, Date.now());
  return true;
};

// ---- folders ----------------------------------------------------------------
export type ReaderFolder = { id: string; name: string; presetId: string | null; parentId: string | null; createdAt: number; count: number; subfolders: number; locked: boolean };

export const listFolders = (): ReaderFolder[] =>
  sqlite.getAllSync<{ id: string; name: string; preset_id: string | null; parent_id: string | null; created_at: number; n: number; sub: number; lock_hash: string | null }>(
    `SELECT f.id, f.name, f.preset_id, f.parent_id, f.created_at, f.lock_hash,
       (SELECT COUNT(*) FROM reader_comics c WHERE c.folder_id = f.id) AS n,
       (SELECT COUNT(*) FROM reader_folders s WHERE s.parent_id = f.id) AS sub
     FROM reader_folders f ORDER BY f.name COLLATE NOCASE`,
  ).map((r) => ({ id: r.id, name: r.name, presetId: r.preset_id, parentId: r.parent_id, createdAt: r.created_at, count: r.n, subfolders: r.sub, locked: !!r.lock_hash }));

/** A new folder, at the top or inside `parentId`. A folder with that name in the same place is reused. */
export const createFolder = (name: string, parentId: string | null = null): string => {
  const existing = sqlite.getFirstSync<{ id: string }>('SELECT id FROM reader_folders WHERE name = ? COLLATE NOCASE AND parent_id IS ?', name, parentId);
  if (existing) return existing.id;
  const id = uid();
  sqlite.runSync('INSERT INTO reader_folders (id, name, created_at, parent_id) VALUES (?, ?, ?, ?)', id, name, Date.now(), parentId);
  return id;
};

export const renameFolder = (id: string, name: string): void => { sqlite.runSync('UPDATE reader_folders SET name = ? WHERE id = ?', name, id); };
export const setFolderPreset = (id: string, presetId: string | null): void => { sqlite.runSync('UPDATE reader_folders SET preset_id = ? WHERE id = ?', presetId, id); };

/** Deleting a folder keeps what is inside: its comics and folders move up to the folder's parent. */
export const deleteFolder = (id: string): void => {
  const parent = sqlite.getFirstSync<{ parent_id: string | null }>('SELECT parent_id FROM reader_folders WHERE id = ?', id)?.parent_id ?? null;
  sqlite.runSync('UPDATE reader_comics SET folder_id = ? WHERE folder_id = ?', parent, id);
  sqlite.runSync('UPDATE reader_folders SET parent_id = ? WHERE parent_id = ?', parent, id);
  sqlite.runSync('DELETE FROM reader_folders WHERE id = ?', id);
};

/** Move comics and folders into `targetId` (null = the top). Folders never go inside themselves. Returns how many moved. */
export const moveItems = (comicIds: string[], folderIds: string[], targetId: string | null): number => {
  const nodes = listFolders();
  const foldersOk = canMoveFolders(nodes, folderIds, targetId) ? folderIds : [];
  sqlite.withTransactionSync(() => {
    for (const id of comicIds) sqlite.runSync('UPDATE reader_comics SET folder_id = ? WHERE id = ?', targetId, id);
    for (const id of foldersOk) sqlite.runSync('UPDATE reader_folders SET parent_id = ? WHERE id = ?', targetId, id);
  });
  return comicIds.length + foldersOk.length;
};

export const getFolder = (id: string): ReaderFolder | null => listFolders().find((f) => f.id === id) ?? null;

// ---- collections ------------------------------------------------------------
// A collection holds works: any comic in My Collection, physical or digital, once. Collections can sit inside collections.
export type ReaderCollection = { id: string; name: string; parentId: string | null; /** Comics directly inside. */ count: number; subcollections: number };

export const listCollections = (): ReaderCollection[] =>
  sqlite.getAllSync<{ id: string; name: string; parent_id: string | null; n: number; sub: number }>(
    `SELECT c.id, c.name, c.parent_id,
       (SELECT COUNT(*) FROM collection_works w WHERE w.collection_id = c.id) AS n,
       (SELECT COUNT(*) FROM reader_collections s WHERE s.parent_id = c.id) AS sub
     FROM reader_collections c ORDER BY c.name COLLATE NOCASE`,
  ).map((r) => ({ id: r.id, name: r.name, parentId: r.parent_id, count: r.n, subcollections: r.sub }));

/** A new collection, at the top or inside `parentId`. One with that name in the same place is reused. */
export const createCollection = (name: string, parentId: string | null = null): string => {
  const existing = sqlite.getFirstSync<{ id: string }>('SELECT id FROM reader_collections WHERE name = ? COLLATE NOCASE AND parent_id IS ?', name, parentId);
  if (existing) return existing.id;
  const id = uid();
  sqlite.runSync('INSERT INTO reader_collections (id, name, created_at, parent_id) VALUES (?, ?, ?, ?)', id, name, Date.now(), parentId);
  return id;
};

export const renameCollection = (id: string, name: string): void => { sqlite.runSync('UPDATE reader_collections SET name = ? WHERE id = ?', name.trim(), id); };

/** Deletes the collection and the collections inside it. The comics themselves are untouched. */
export const deleteCollection = (id: string): void => {
  const all = [id];
  for (let i = 0; i < all.length; i++) for (const r of sqlite.getAllSync<{ id: string }>('SELECT id FROM reader_collections WHERE parent_id = ?', all[i])) all.push(r.id);
  sqlite.withTransactionSync(() => {
    for (const cid of all) {
      sqlite.runSync('DELETE FROM collection_works WHERE collection_id = ?', cid);
      sqlite.runSync('DELETE FROM reader_collection_items WHERE collection_id = ?', cid);
      sqlite.runSync('DELETE FROM reader_collections WHERE id = ?', cid);
    }
  });
};

/** The works directly inside a collection, oldest added first. */
export const collectionWorkIds = (collectionId: string): string[] =>
  sqlite.getAllSync<{ work_id: string }>('SELECT work_id FROM collection_works WHERE collection_id = ? ORDER BY added_at', collectionId).map((r) => r.work_id);

export const addWorksToCollection = (collectionId: string, workIds: string[]): number => {
  let added = 0;
  sqlite.withTransactionSync(() => {
    for (const workId of workIds) added += sqlite.runSync('INSERT OR IGNORE INTO collection_works (collection_id, work_id, added_at) VALUES (?, ?, ?)', collectionId, workId, Date.now()).changes;
  });
  return added;
};

export const removeWorksFromCollection = (collectionId: string, workIds: string[]): void => {
  sqlite.withTransactionSync(() => { for (const workId of workIds) sqlite.runSync('DELETE FROM collection_works WHERE collection_id = ? AND work_id = ?', collectionId, workId); });
};

/** Files on the shelf whose comic is in the collection. */
export const collectionComicIds = (collectionId: string): string[] =>
  sqlite.getAllSync<{ id: string }>('SELECT c.id FROM reader_comics c JOIN collection_works w ON w.work_id = c.work_id WHERE w.collection_id = ?', collectionId).map((r) => r.id);

export const collectionsForComic = (comicId: string): string[] =>
  sqlite.getAllSync<{ collection_id: string }>('SELECT w.collection_id FROM collection_works w JOIN reader_comics c ON c.work_id = w.work_id WHERE c.id = ?', comicId).map((r) => r.collection_id);

/** Adds the comic's work if absent, removes it if present. Returns whether it is in the collection now. */
export const toggleInCollection = (collectionId: string, comicId: string): boolean => {
  const workId = sqlite.getFirstSync<{ work_id: string | null }>('SELECT work_id FROM reader_comics WHERE id = ?', comicId)?.work_id;
  if (!workId) return false;
  const has = sqlite.getFirstSync('SELECT 1 FROM collection_works WHERE collection_id = ? AND work_id = ?', collectionId, workId);
  if (has) { removeWorksFromCollection(collectionId, [workId]); return false; }
  addWorksToCollection(collectionId, [workId]);
  return true;
};

// ---- guided-view panel cache -------------------------------------------------
export type CachedPanels = { rtl: boolean; panels: Array<{ x: number; y: number; w: number; h: number }> };

export const getCachedPanels = (comicId: string, page: number): CachedPanels | null => {
  const row = sqlite.getFirstSync<{ panels_json: string }>('SELECT panels_json FROM reader_panels WHERE comic_id = ? AND page = ?', comicId, page);
  try { return row ? (JSON.parse(row.panels_json) as CachedPanels) : null; } catch { return null; }
};

export const saveCachedPanels = (comicId: string, page: number, value: CachedPanels): void => {
  sqlite.runSync('INSERT OR REPLACE INTO reader_panels (comic_id, page, panels_json) VALUES (?, ?, ?)', comicId, page, JSON.stringify(value));
};

// ---- privacy lock ----------------------------------------------------------
type LockKind = 'comic' | 'folder';
const lockTable = (kind: LockKind) => (kind === 'comic' ? 'reader_comics' : 'reader_folders');

export const getLock = (kind: LockKind, id: string): Lock | null => {
  const r = sqlite.getFirstSync<{ lock_hash: string | null; lock_salt: string | null }>(`SELECT lock_hash, lock_salt FROM ${lockTable(kind)} WHERE id = ?`, id);
  return r?.lock_hash && r.lock_salt ? { hash: r.lock_hash, salt: r.lock_salt } : null;
};

export const setLock = (kind: LockKind, id: string, lock: Lock | null): void => {
  sqlite.runSync(`UPDATE ${lockTable(kind)} SET lock_hash = ?, lock_salt = ? WHERE id = ?`, lock?.hash ?? null, lock?.salt ?? null, id);
};

/** Where a comic's file lives now: a local path, or (for a cloud link) a cloud address with no local copy yet. */
export const setComicStorage = (id: string, path: string, sourceUri: string | null): void => {
  sqlite.runSync('UPDATE reader_comics SET path = ?, source_uri = ? WHERE id = ?', path, sourceUri, id);
};
