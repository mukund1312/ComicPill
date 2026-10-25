// Covers for comics that came from the reader's own files (the catalog's bundled artwork only knows its own books).
import { sqlite } from '../lib/db/client';

const covers = new Map<string, string>();

export const fileCoverFor = (workId: string): string | undefined => covers.get(workId);
export const registerFileCover = (workId: string, uri: string): void => { covers.set(workId, uri); };

/** Call once at start-up, after the database is open. */
export function loadFileCovers(): void {
  try {
    for (const r of sqlite.getAllSync<{ id: string; cover_path: string }>("SELECT id, cover_path FROM works WHERE cover_path LIKE 'file:%'")) covers.set(r.id, r.cover_path);
  } catch { /* an older database simply has none yet */ }
}
