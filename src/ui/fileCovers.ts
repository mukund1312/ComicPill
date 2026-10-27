// Covers for comics that came from the reader's own files (the catalog's bundled artwork only knows its own books).
import { sqlite } from '../lib/db/client';
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { Paths } from 'expo-file-system';
import { rebase } from '../lib/reader/portablePath';

const ROOTS: Record<string, string> = { '/Documents/': Paths.document.uri.endsWith('/') ? Paths.document.uri : `${Paths.document.uri}/` };

const covers = new Map<string, string>();

export const fileCoverFor = (workId: string): string | undefined => covers.get(workId);
export const registerFileCover = (workId: string, uri: string): void => { covers.set(workId, uri); };

/** Call once at start-up, after the database is open. */
export function loadFileCovers(): void {
  try {
    for (const r of sqlite.getAllSync<{ id: string; cover_path: string }>("SELECT id, cover_path FROM works WHERE cover_path LIKE 'file:%'")) covers.set(r.id, rebase(r.cover_path, ROOTS));
  } catch { /* an older database simply has none yet */ }
}
