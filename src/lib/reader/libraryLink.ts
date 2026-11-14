// Every comic in Read Files is also a comic in the library — owned digitally — and in the catalog Discover browses.
// Imported files that match a catalog book (same title) are linked to it; anything else becomes a new catalog entry.
import { sqlite } from '../db/client';
import { upsertLibraryEntry } from '../db/queries/library';
import { findCatalogMatch } from './catalogMatch';
import { registerFileCover } from '../../ui/fileCovers';
import { mergeOwn } from '../util/own';
import type { Own } from '../types/domain';

type Linkable = { id: string; title: string; series: string | null; writer: string | null; coverPath: string | null; workId: string | null };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Link one imported comic: find or create its catalog work, mark it owned digitally, remember the link. Returns the work id. */
export function linkReaderComic(c: Linkable): string {
  const titles = sqlite.getAllSync<{ id: string; title: string }>('SELECT id, title FROM works');
  let workId = c.workId && titles.some((t) => t.id === c.workId) ? c.workId : findCatalogMatch(titles, c.title, c.series);
  if (!workId) {
    workId = `file-${c.id}`;
    sqlite.runSync(
      "INSERT OR IGNORE INTO works (id, title, sort_title, match_key, universe, genres, creators, characters, keeper_flag, context_needed, completeness, cover_path) VALUES (?, ?, ?, ?, 'main', '[]', ?, '[]', 0, 'none', 'complete', ?)",
      workId, c.title, norm(c.title), `file:${c.id}`, JSON.stringify(c.writer ? [c.writer] : []), c.coverPath,
    );
    if (c.coverPath) registerFileCover(workId, c.coverPath);
  }
  const existing = sqlite.getFirstSync<{ own: string }>('SELECT own FROM user_library WHERE work_id = ?', workId);
  upsertLibraryEntry(workId, { own: mergeOwn((existing?.own ?? 'none') as Own, 'digital') });
  sqlite.runSync('UPDATE reader_comics SET work_id = ? WHERE id = ?', workId, c.id);
  return workId;
}

/** A cover that arrived after the catalog entry was made (a linked comic is read later). Only entries made for a file are touched. */
export function setWorkCover(workId: string, coverPath: string): void {
  if (!workId.startsWith('file-')) return;
  sqlite.runSync('UPDATE works SET cover_path = ? WHERE id = ?', coverPath, workId);
  registerFileCover(workId, coverPath);
}

/** Comics imported before linking existed (or whose link was lost) get linked now. Cheap when there is nothing to do. */
export function backfillReaderLinks(): number {
  const rows = sqlite.getAllSync<{ id: string; title: string; series: string | null; writer: string | null; cover_path: string | null }>('SELECT id, title, series, writer, cover_path FROM reader_comics WHERE work_id IS NULL AND hidden = 0');
  for (const r of rows) linkReaderComic({ id: r.id, title: r.title, series: r.series, writer: r.writer, coverPath: r.cover_path, workId: null });
  return rows.length;
}

/** The file is gone: give the digital copy back. A catalog entry made only for this file goes with it. */
export function unlinkReaderComic(readerComicId: string): void {
  const row = sqlite.getFirstSync<{ work_id: string | null }>('SELECT work_id FROM reader_comics WHERE id = ?', readerComicId);
  const workId = row?.work_id;
  if (!workId) return;
  const others = sqlite.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM reader_comics WHERE work_id = ? AND id <> ?', workId, readerComicId)?.n ?? 0;
  if (others > 0) return; // another file still backs this book
  if (workId.startsWith('file-')) {
    sqlite.runSync('DELETE FROM user_library WHERE work_id = ?', workId);
    sqlite.runSync('DELETE FROM works WHERE id = ?', workId);
    return;
  }
  const lib = sqlite.getFirstSync<{ own: string }>('SELECT own FROM user_library WHERE work_id = ?', workId);
  if (lib?.own === 'digital') upsertLibraryEntry(workId, { own: 'none' });
  else if (lib?.own === 'both') upsertLibraryEntry(workId, { own: 'physical' });
}
