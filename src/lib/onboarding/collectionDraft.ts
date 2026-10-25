// The books a reader is setting up in onboarding, held in memory until they
// press "Add to my library". Ownership (what you have) and reading status
// (what you've done with it) are separate fields on purpose: an unread book
// you own says nothing about your taste, and a finished one says nothing
// about where it lives.
import type { Own, ReadStatus } from '../types/domain';

export type Ownership = 'physical' | 'digital' | 'both' | 'wishlist';
export type ReadingState = 'unread' | 'reading' | 'finished';
export type Source = 'shelf_scan' | 'screenshot' | 'manual';

export interface DraftItem {
  workId: string;
  title: string;
  ownership: Ownership;
  reading: ReadingState;
  source: Source;
}

export const OWNERSHIP_LABEL: Record<Ownership, string> = { physical: 'Physical', digital: 'Digital', both: 'Both', wishlist: 'Wishlist' };
export const READING_LABEL: Record<ReadingState, string> = { unread: 'Unread', reading: 'Reading', finished: 'Finished' };
export const OWNERSHIP_ORDER: Ownership[] = ['physical', 'digital', 'both', 'wishlist'];
export const READING_ORDER: ReadingState[] = ['unread', 'reading', 'finished'];

/** Add books the reader confirmed. A book already in the draft keeps the choices
 *  they made on it (adding it again from another source changes nothing). */
export function addItems(draft: readonly DraftItem[], incoming: readonly DraftItem[]): DraftItem[] {
  const have = new Set(draft.map((d) => d.workId));
  const out = [...draft];
  for (const item of incoming) {
    if (have.has(item.workId)) continue;
    have.add(item.workId);
    out.push(item);
  }
  return out;
}

export type ItemPatch = Partial<Pick<DraftItem, 'ownership' | 'reading'>>;

/** Change one book, or many at once (bulk edit). Unknown ids are ignored. */
export function patchItems(draft: readonly DraftItem[], ids: ReadonlySet<string>, patch: ItemPatch): DraftItem[] {
  return draft.map((d) => (ids.has(d.workId) ? { ...d, ...patch } : d));
}

export const removeItems = (draft: readonly DraftItem[], ids: ReadonlySet<string>): DraftItem[] => draft.filter((d) => !ids.has(d.workId));

export interface DraftStats {
  total: number;
  physical: number; // owned in print, alone or with a digital copy
  digital: number;
  wishlist: number;
  owned: number;
  unread: number; // owned and not started; a wishlist book is not "on the pile"
  reading: number;
  finished: number;
}

export function draftStats(draft: readonly DraftItem[]): DraftStats {
  const owned = draft.filter((d) => d.ownership !== 'wishlist');
  return {
    total: draft.length,
    physical: draft.filter((d) => d.ownership === 'physical' || d.ownership === 'both').length,
    digital: draft.filter((d) => d.ownership === 'digital' || d.ownership === 'both').length,
    wishlist: draft.length - owned.length,
    owned: owned.length,
    unread: owned.filter((d) => d.reading === 'unread').length,
    reading: draft.filter((d) => d.reading === 'reading').length,
    finished: draft.filter((d) => d.reading === 'finished').length,
  };
}

/** How the draft is written into the library. When the book is already there
 *  the reader's existing ownership is widened, never narrowed, and existing
 *  progress is never moved backwards (an "unread" draft can't un-finish a book). */
export function toLibraryFields(item: DraftItem, current: { own: Own; status: ReadStatus }): { own: Own; status: ReadStatus } {
  const rank: Record<string, number> = { none: 0, dropped: 0, reading: 1, done: 2 };
  const wanted: ReadStatus = item.reading === 'finished' ? 'done' : item.reading === 'reading' ? 'reading' : 'none';
  const status = (rank[wanted] ?? 0) >= (rank[current.status] ?? 0) ? wanted : current.status;
  return { own: widenOwn(current.own, item.ownership), status };
}

function widenOwn(current: Own, next: Ownership): Own {
  if (current === 'none' || current === 'wishlist') return next; // a wishlist book you now have becomes owned
  if (next === 'wishlist') return current; // never downgrade something owned to a wish
  const has = (o: Own, f: 'physical' | 'digital') => o === 'both' || o === f;
  const physical = has(current, 'physical') || has(next, 'physical');
  const digital = has(current, 'digital') || has(next, 'digital');
  if (physical && digital) return 'both';
  if (physical) return 'physical';
  if (digital) return 'digital';
  return current; // ordered / subscription stay as they were
}

/** Which books to run the first "what should I read" over: owned and not yet finished. */
export function readableIds(draft: readonly DraftItem[]): string[] {
  return draft.filter((d) => d.ownership !== 'wishlist' && d.reading !== 'finished').map((d) => d.workId);
}

export function libraryReadySummary(s: DraftStats): string {
  if (s.total === 0) return 'Your library is empty for now. Add books any time from the Library tab.';
  const parts = [`${s.owned} owned`];
  if (s.unread) parts.push(`${s.unread} unread`);
  if (s.reading) parts.push(`${s.reading} in progress`);
  if (s.finished) parts.push(`${s.finished} finished`);
  if (s.wishlist) parts.push(`${s.wishlist} on your wishlist`);
  return parts.join(' · ');
}
