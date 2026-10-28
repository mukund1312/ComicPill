// What ComicPill keeps on the device, and ways to give it back. Comics you imported are the only thing that is yours to delete one by one;
// the rest (fetched cloud copies and leftover temporary files) can always be cleared and comes back or is rebuilt when needed.
import { Directory, Paths } from 'expo-file-system';

const comicsRoot = () => new Directory(Paths.document, 'comics');
import { cacheRoot } from './cloudCache';

const sizeOf = (entry: { exists: boolean; size?: number | null }): number => { try { return entry.exists ? (entry.size ?? 0) : 0; } catch { return 0; } };

/** Places where file pickers and unpacking leave copies behind: the picker's cache folder, unzip leftovers, and iOS's "-Inbox" folders. */
type Removable = Directory | { exists: boolean; size?: number | null; delete(): void };

function temporaryEntries(): Removable[] {
  const out: Removable[] = [];
  try { out.push(new Directory(Paths.cache, 'DocumentPicker')); } catch { /* not there */ }
  try { out.push(new Directory(Paths.cache, 'online-covers')); } catch { /* not there */ }
  try {
    for (const e of new Directory(Paths.cache).list()) if (e.name.startsWith('nested-')) out.push(e);
  } catch { /* nothing to list */ }
  try {
    const tmp = new Directory(Paths.document.parentDirectory, 'tmp');
    if (tmp.exists) for (const e of tmp.list()) if (e.name.endsWith('-Inbox')) out.push(e);
  } catch { /* iOS only */ }
  return out;
}

export type StorageUsage = { comics: number; fetched: number; temporary: number };

export const storageUsage = (): StorageUsage => ({
  comics: sizeOf(comicsRoot()),
  fetched: sizeOf(cacheRoot()),
  temporary: temporaryEntries().reduce((n, e) => n + sizeOf(e), 0),
});

/** Delete the copies fetched from the cloud. The links, covers and reading progress stay; each comic is fetched again when opened. Returns bytes freed. */
export function clearFetchedCopies(): number {
  let freed = 0;
  try {
    const root = cacheRoot();
    if (!root.exists) return 0;
    for (const e of root.list()) { freed += sizeOf(e); try { e.delete(); } catch { /* in use; try again later */ } }
  } catch { /* nothing to clear */ }
  return freed;
}

/** Delete leftover temporary files. Safe at any time except in the middle of an import. Returns bytes freed. */
export function clearTemporaryFiles(): number {
  let freed = 0;
  for (const e of temporaryEntries()) {
    freed += sizeOf(e);
    try { if (e instanceof Directory && e.name.endsWith('-Inbox')) { for (const inner of e.list()) { try { inner.delete(); } catch { /* ignore */ } } } else e.delete(); } catch { /* ignore */ }
  }
  return freed;
}
