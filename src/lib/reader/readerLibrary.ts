import { sqlite } from '../db/client';

export type ReaderMode = 'ltr' | 'rtl' | 'webtoon';

export type ReaderComic = {
  id: string; title: string; path: string; format: string; pageCount: number;
  coverPath: string | null; addedAt: number; lastReadAt: number | null; progressPage: number; mode: ReaderMode;
};

type Row = {
  id: string; title: string; path: string; format: string; page_count: number; cover_path: string | null;
  added_at: number; last_read_at: number | null; progress_page: number; mode: string;
};

const map = (r: Row): ReaderComic => ({
  id: r.id, title: r.title, path: r.path, format: r.format, pageCount: r.page_count, coverPath: r.cover_path,
  addedAt: r.added_at, lastReadAt: r.last_read_at, progressPage: r.progress_page, mode: r.mode as ReaderMode,
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

export const saveReaderProgress = (id: string, page: number): void => {
  sqlite.runSync('UPDATE reader_comics SET progress_page = ?, last_read_at = ? WHERE id = ?', page, Date.now(), id);
};

export const saveReaderMode = (id: string, mode: ReaderMode): void => {
  sqlite.runSync('UPDATE reader_comics SET mode = ? WHERE id = ?', mode, id);
};

export const deleteReaderComic = (id: string): void => {
  sqlite.runSync('DELETE FROM reader_comics WHERE id = ?', id);
};
