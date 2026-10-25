// Pure shelf logic (filter / sort / read state) so it can be unit-tested without a database.
export type ShelfComic = {
  id: string; title: string; series: string | null; writer: string | null;
  pageCount: number; progressPage: number; lastReadAt: number | null; addedAt: number;
};

export type SortKey = 'recent' | 'title' | 'added';
export const SORT_LABEL: Record<SortKey, string> = { recent: 'Recent', title: 'Title', added: 'Date added' };

export const isFinished = (c: ShelfComic) => c.lastReadAt != null && c.pageCount > 0 && c.progressPage >= c.pageCount - 1;
/** In progress: opened, past the first page, not finished. */
export const isReadingNow = (c: ShelfComic) => c.lastReadAt != null && c.progressPage > 0 && !isFinished(c);
export const progressFraction = (c: ShelfComic) => (c.pageCount > 1 ? Math.min(1, c.progressPage / (c.pageCount - 1)) : 0);

export function matchesQuery(c: ShelfComic, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [c.title, c.series, c.writer].some((f) => f?.toLowerCase().includes(q));
}

export function sortComics<T extends ShelfComic>(list: T[], key: SortKey): T[] {
  const copy = [...list];
  if (key === 'title') return copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
  if (key === 'added') return copy.sort((a, b) => b.addedAt - a.addedAt);
  return copy.sort((a, b) => (b.lastReadAt ?? b.addedAt) - (a.lastReadAt ?? a.addedAt));
}

/** Reading Now: in-progress comics, most recently read first. */
export const readingNow = <T extends ShelfComic>(list: T[]): T[] =>
  list.filter(isReadingNow).sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0));
