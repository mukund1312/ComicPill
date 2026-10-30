import type { OrderEntry, ReadingOrder } from './types';

/** Lower case, punctuation gone, and every way of writing a volume ("v01", "Vol. 1", "Book 01", "Part 1") folded to "v1". */
export const normalize = (s: string): string =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/[’']/g, '')
    .replace(/\b(?:v|vol|volume|book|part)\.?\s*0*(\d+)\b/g, ' v$1 ')
    .replace(/[^a-z0-9]+/g, ' ').trim();

const tokens = (s: string): Set<string> => new Set(normalize(s).split(' ').filter(Boolean));

/** Does a comic with this title count as this entry? */
export function titleMatches(entry: OrderEntry, title: string): boolean {
  const bare = normalize(title.replace(/\([^)]*\)/g, ' '));
  if (entry.exact?.some((e) => normalize(e) === bare)) return true;
  const have = tokens(title);
  if (entry.not?.some((w) => have.has(normalize(w)))) return false;
  return (entry.match ?? []).some((phrase) => { const need = [...tokens(phrase)]; return need.length > 0 && need.every((w) => have.has(w)); });
}

export type EntryState = { entry: OrderEntry; owned: boolean; /** The title of the comic that matched. */ ownedAs?: string };
export type OrderProgress = {
  order: ReadingOrder;
  entries: EntryState[];
  have: number; total: number;
  haveEssential: number; totalEssential: number;
  /** What is missing, essential first. */
  missing: OrderEntry[];
};

/** Lay a reading order against the comics you own. */
export function progressFor(order: ReadingOrder, ownedTitles: string[]): OrderProgress {
  const entries = order.entries.map((entry) => { const hit = ownedTitles.find((t) => titleMatches(entry, t)); return { entry, owned: hit !== undefined, ownedAs: hit }; });
  const missing = entries.filter((e) => !e.owned).map((e) => e.entry).sort((a, b) => Number(a.role === 'optional') - Number(b.role === 'optional'));
  return {
    order, entries, missing,
    have: entries.filter((e) => e.owned).length, total: entries.length,
    haveEssential: entries.filter((e) => e.owned && e.entry.role === 'essential').length, totalEssential: entries.filter((e) => e.entry.role === 'essential').length,
  };
}

/** One line: "You have 5 of 9. Missing: Time Runs Out v3 (6 of the missing are optional)". */
export function summaryLine(p: OrderProgress): string {
  const optionalMissing = p.missing.filter((m) => m.role === 'optional').length;
  if (!p.missing.length) return `You have all ${p.total}.`;
  const names = p.missing.slice(0, 2).map((m) => m.title).join(', ');
  const more = p.missing.length > 2 ? ` and ${p.missing.length - 2} more` : '';
  const tail = optionalMissing ? ` (${optionalMissing === p.missing.length ? 'all' : optionalMissing} of the missing ${optionalMissing === 1 ? 'is' : 'are'} optional)` : '';
  return `You have ${p.have} of ${p.total}. Missing: ${names}${more}${tail}.`;
}

/** Free text to the orders it is probably about: "i want to read flashpoint", "secret wars 2015", "hickman avengers". Best match first. */
export function findOrders(query: string, orders: ReadingOrder[]): ReadingOrder[] {
  const words = [...tokens(query)].filter((w) => !STOP.has(w));
  if (!words.length) return [];
  const scored = orders.map((o) => {
    const names = [o.title, ...o.aliases].map(tokens);
    const inEntries = new Set(o.entries.flatMap((e) => [...tokens(e.title)]));
    let score = 0;
    for (const w of words) {
      if (names.some((n) => n.has(w))) score += 3;
      else if (inEntries.has(w)) score += 1;
    }
    // Everything typed found in one name is a strong hit.
    if (names.some((n) => words.every((w) => n.has(w)))) score += 4;
    return { o, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).map((s) => s.o);
}

const STOP = new Set(['i', 'want', 'to', 'read', 'the', 'a', 'an', 'of', 'me', 'my', 'how', 'do', 'start', 'with', 'for', 'order', 'reading', 'list', 'play', 'playlist', 'make', 'give', 'show', 'and', 'in']);
