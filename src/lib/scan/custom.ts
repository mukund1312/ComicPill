// A comic that is on the reader's shelf but not in the built-in catalog gets an entry of its own, so any comic can be logged.
import { randomUUID } from 'expo-crypto';
import { sqlite } from '../db/client';
import { registerFileCover } from '../../ui/fileCovers';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The name an entry is kept under: the title, with its volume if the spine had one. */
export const fullTitle = (title: string, volume: string | null): string => (volume ? `${title} ${volume}` : title).replace(/\s+/g, ' ').trim();

/** Make a catalog entry for a scanned comic and return its id. `coverPath` is the photo of its spine. */
export function createScannedWork(b: { title: string; volume: string | null; creators: string[]; coverPath: string | null }): string {
  const id = `scan-${randomUUID()}`;
  const title = fullTitle(b.title, b.volume);
  sqlite.runSync(
    "INSERT OR IGNORE INTO works (id, title, sort_title, match_key, universe, genres, creators, characters, keeper_flag, context_needed, completeness, cover_path) VALUES (?, ?, ?, ?, 'main', '[]', ?, '[]', 0, 'none', 'complete', ?)",
    id, title, norm(title), `scan:${id}`, JSON.stringify(b.creators), b.coverPath,
  );
  if (b.coverPath) registerFileCover(id, b.coverPath);
  return id;
}
