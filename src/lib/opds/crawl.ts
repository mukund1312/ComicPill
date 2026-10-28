// Walking a comic server's catalog: every comic in it, with the series it sits under. Pure apart from fetching the feeds.
import { loadFeed } from './client';
import type { OpdsAcquisition, OpdsEntry } from './parse';
import type { OpdsServer } from './servers';

const MAX_DEPTH = 6;
const MAX_COMICS = 20000;
/** Catalog sections that repeat books found elsewhere (Komga's "Keep reading", "Latest"…); skipped so a book is filed under its series. */
const REPEATS = /^(keep reading|on deck|latest|recently|newest|new\b|popular|read lists?|collections?|search)/i;
/** Wrapper levels that say nothing about where a comic belongs. */
const GENERIC = /^(all libraries|libraries|all series|series|all books|books|root|catalog)$/i;

export type FoundComic = { entry: OpdsEntry; acquisition: OpdsAcquisition; /** Folder names from the server down to the series. */ path: string[] };

/** Walk the catalog from `startUrl` and list every comic in it, following pages and sub-catalogs. */
export async function crawlCatalog(server: OpdsServer, startUrl: string, progress: { onProgress?: (p: { done: number; total: number; name: string; phase?: string }) => void; cancel?: { cancelled: boolean } } = {}): Promise<FoundComic[]> {
  const found: FoundComic[] = []; const seen = new Set<string>(); const visited = new Set<string>();
  const walk = async (url: string, path: string[], depth: number): Promise<void> => {
    for (let page: string | null = url; page && !visited.has(page) && !progress.cancel?.cancelled && found.length < MAX_COMICS; ) {
      visited.add(page);
      const feed = await loadFeed(page, server);
      for (const entry of feed.entries) {
        if (progress.cancel?.cancelled) return;
        const acquisition = entry.acquisitions[0];
        if (acquisition) {
          if (!seen.has(entry.id)) { seen.add(entry.id); found.push({ entry, acquisition, path }); }
        } else if (entry.nav && depth < MAX_DEPTH && !REPEATS.test(entry.title)) {
          await walk(entry.nav, GENERIC.test(entry.title) ? path : [...path, entry.title], depth + 1);
        }
      }
      progress.onProgress?.({ done: 0, total: 0, name: `${found.length} comics found…`, phase: 'Reading the catalog' });
      page = feed.next;
    }
  };
  await walk(startUrl, [], 0);
  return found;
}

