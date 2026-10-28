// Covers for comics that came from the reader's own files (the catalog's bundled artwork only knows its own books).
import { sqlite } from '../lib/db/client';
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { Paths } from 'expo-file-system';
import { rebase } from '../lib/reader/portablePath';

const ROOTS: Record<string, string> = { '/Documents/': Paths.document.uri.endsWith('/') ? Paths.document.uri : `${Paths.document.uri}/` };

const covers = new Map<string, string>();

export const fileCoverFor = (workId: string): string | undefined => covers.get(workId);

// The reader's own cover for a comic they own: it wins over the catalog's artwork for them, and never changes the catalog.
const customCovers = new Map<string, string>();
export const customCoverFor = (workId: string): string | undefined => customCovers.get(workId);
export const registerCustomCover = (workId: string, uri: string | null): void => { if (uri) customCovers.set(workId, uri); else customCovers.delete(workId); };
export const registerFileCover = (workId: string, uri: string): void => { covers.set(workId, uri); };

/** Call once at start-up, after the database is open. */
export function loadFileCovers(): void {
  try {
    for (const r of sqlite.getAllSync<{ id: string; cover_path: string }>("SELECT id, cover_path FROM works WHERE cover_path LIKE 'file:%'")) covers.set(r.id, rebase(r.cover_path, ROOTS));
  } catch { /* an older database simply has none yet */ }
  try {
    for (const r of sqlite.getAllSync<{ work_id: string; custom_cover_path: string }>('SELECT work_id, custom_cover_path FROM user_library WHERE custom_cover_path IS NOT NULL')) customCovers.set(r.work_id, rebase(r.custom_cover_path, ROOTS));
  } catch { /* an older database simply has none yet */ }
}
