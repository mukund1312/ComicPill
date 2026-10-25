// Connects words the reader used ("World's Finest") to catalog books, and
// turns what a message implied ("I finished X") into a PROPOSAL the reader
// confirms. Nothing here writes anything.
import type { ReadingIntent } from './schema';
import { norm } from './resolve';

export interface CatalogTitle { id: string; title: string }

/** The catalog book a phrase refers to, or null. A phrase matches a title that
 *  contains it as whole words; among several, the shortest title wins, which
 *  prefers "Vol. 1" over a later, longer-named volume. */
export function findWorkByTitle(query: string, titles: Iterable<CatalogTitle>): CatalogTitle | null {
  const q = norm(query);
  if (q.trim().length < 3) return null;
  const hits = [...titles].filter((t) => norm(t.title).includes(q));
  if (!hits.length) return null;
  return hits.sort((a, b) => a.title.length - b.title.length || a.title.localeCompare(b.title))[0];
}

export interface LibraryProposal {
  workId: string;
  title: string;
  action: 'mark_finished' | 'mark_reading';
  /** The question put to the reader. */
  prompt: string;
}

/** Resolve the model's proposed updates against the catalog, dropping any that
 *  are already true or that can't be matched. The reader confirms each one. */
export function resolveProposals(
  updates: ReadingIntent['proposedLibraryUpdates'],
  titles: Iterable<CatalogTitle>,
  currentStatus: (workId: string) => 'none' | 'reading' | 'done' | 'dropped',
): LibraryProposal[] {
  const all = [...titles];
  const out: LibraryProposal[] = [];
  const seen = new Set<string>();
  for (const u of updates) {
    const hit = findWorkByTitle(u.work, all);
    if (!hit || seen.has(`${hit.id}:${u.action}`)) continue;
    const status = currentStatus(hit.id);
    if (u.action === 'mark_finished' && status === 'done') continue;
    if (u.action === 'mark_reading' && (status === 'reading' || status === 'done')) continue;
    seen.add(`${hit.id}:${u.action}`);
    out.push({
      workId: hit.id, title: hit.title, action: u.action,
      prompt: u.action === 'mark_finished'
        ? `Sounds like you finished ${hit.title}. Mark as finished?`
        : `Sounds like you’re reading ${hit.title}. Mark as reading?`,
    });
  }
  return out;
}
