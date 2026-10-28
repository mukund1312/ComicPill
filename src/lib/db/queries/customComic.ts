// A comic the reader added by hand because the catalog doesn't have it. It lives only in their own database (an entry plus one edition),
// never in anything shared, and has no cover until they add one.
import { randomUUID } from 'expo-crypto';
import { sqlite } from '../client';
import { fullTitle } from '../../scan/custom';
import type { ManualComic } from '../../scan/manual';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Create the comic and its edition together, or neither. Returns the new comic's id. */
export function createCustomComic(c: ManualComic): string {
  const workId = `custom-${randomUUID()}`;
  const editionId = `ed-${workId}`;
  const title = fullTitle(c.title, c.volume);
  sqlite.withTransactionSync(() => {
    sqlite.runSync(
      "INSERT INTO works (id, title, sort_title, match_key, publisher, universe, genres, creators, characters, keeper_flag, context_needed, completeness, cover_path) VALUES (?, ?, ?, ?, ?, 'main', '[]', ?, '[]', 0, 'none', 'complete', NULL)",
      workId, title, norm(title), `custom:${workId}`, c.publisher, JSON.stringify(c.creators),
    );
    sqlite.runSync(
      'INSERT INTO editions (id, printing, format, isbn13, pages, release_date, format_note) VALUES (?, ?, ?, ?, ?, ?, ?)',
      editionId, c.printing, c.format, c.isbn13, c.pages, c.year ? String(c.year) : null, c.series ? `Series: ${c.series}` : null,
    );
    sqlite.runSync('INSERT INTO edition_works (edition_id, work_id, position) VALUES (?, ?, 0)', editionId, workId);
  });
  return workId;
}
