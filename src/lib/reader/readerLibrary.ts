import { sqlite } from '../db/client';

export type ReaderMode = 'ltr' | 'rtl' | 'webtoon';

export type ReaderComic = {
  id: string; title: string; path: string; format: string; pageCount: number;
  coverPath: string | null; addedAt: number; lastReadAt: number | null; progressPage: number; mode: ReaderMode;
  /** Webtoon only: how far into the progress page you had scrolled, 0..1. */
  progressOffset: number;
  sizes: Array<{ width: number; height: number } | null> | null;
};

type Row = {
  id: string; title: string; path: string; format: string; page_count: number; cover_path: string | null;
  added_at: number; last_read_at: number | null; progress_page: number; mode: string;
  progress_offset: number; sizes_json: string | null;
};

const parseSizes = (json: string | null): ReaderComic['sizes'] => {
  try { const v = json ? JSON.parse(json) : null; return Array.isArray(v) ? v : null; } catch { return null; }
};

const map = (r: Row): ReaderComic => ({
  id: r.id, title: r.title, path: r.path, format: r.format, pageCount: r.page_count, coverPath: r.cover_path,
  addedAt: r.added_at, lastReadAt: r.last_read_at, progressPage: r.progress_page, mode: r.mode as ReaderMode,
  progressOffset: r.progress_offset ?? 0, sizes: parseSizes(r.sizes_json),
});

export const listReaderComics = (): ReaderComic[] =>
  sqlite.getAllSync<Row>('SELECT * FROM reader_comics ORDER BY COALESCE(last_read_at, added_at) DESC').map(map);

export const getReaderComic = (id: string): ReaderComic | null => {
  const row = sqlite.getFirstSync<Row>('SELECT * FROM reader_comics WHERE id = ?', id);
  return row ? map(row) : null;
};

export const insertReaderComic = (c: Pick<ReaderComic, 'id' | 'title' | 'path' | 'format' | 'pageCount' | 'coverPath'>): void => {
  sqlite.runSync(
    'INSERT INTO reader_comics (id, title, path, format, page_count, cover_path, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    c.id, c.title, c.path, c.format, c.pageCount, c.coverPath, Date.now(),
  );
};

export const saveReaderProgress = (id: string, page: number, offset = 0): void => {
  sqlite.runSync('UPDATE reader_comics SET progress_page = ?, progress_offset = ?, last_read_at = ? WHERE id = ?', page, offset, Date.now(), id);
};

export const saveReaderSizes = (id: string, sizes: ReaderComic['sizes']): void => {
  sqlite.runSync('UPDATE reader_comics SET sizes_json = ? WHERE id = ?', JSON.stringify(sizes), id);
};

export const saveReaderMode = (id: string, mode: ReaderMode): void => {
  sqlite.runSync('UPDATE reader_comics SET mode = ? WHERE id = ?', mode, id);
};

export const deleteReaderComic = (id: string): void => {
  sqlite.runSync('DELETE FROM reader_comics WHERE id = ?', id);
  sqlite.runSync('DELETE FROM reader_bookmarks WHERE comic_id = ?', id);
};

export const listBookmarks = (comicId: string): number[] =>
  sqlite.getAllSync<{ page: number }>('SELECT page FROM reader_bookmarks WHERE comic_id = ? ORDER BY page', comicId).map((r) => r.page);

/** Adds the bookmark if absent, removes it if present. Returns whether the page is bookmarked now. */
export const toggleBookmark = (comicId: string, page: number): boolean => {
  const exists = sqlite.getFirstSync('SELECT 1 FROM reader_bookmarks WHERE comic_id = ? AND page = ?', comicId, page);
  if (exists) { sqlite.runSync('DELETE FROM reader_bookmarks WHERE comic_id = ? AND page = ?', comicId, page); return false; }
  sqlite.runSync('INSERT INTO reader_bookmarks (comic_id, page, created_at) VALUES (?, ?, ?)', comicId, page, Date.now());
  return true;
};
