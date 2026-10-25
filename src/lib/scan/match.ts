// Map what the model read onto the catalog. The model never decides what is
// "in the library" — this does, conservatively: a book is only "matched" when
// the title genuinely lines up; near-misses go to the reader for review, and
// anything else is reported as not in the catalog rather than force-fitted.
import type { ScannedBook } from './schema';

export interface CatalogTitle { id: string; title: string }

export type MatchStatus = 'matched' | 'review' | 'unmatched';

export interface ScanMatch {
  scanned: ScannedBook;
  status: MatchStatus;
  workId: string | null;
  workTitle: string | null;
  score: number;
}

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'vol', 'volume', 'book', 'part', 'edition', 'tpb', 'hc', 'collection', 'complete', 'deluxe', 'omnibus', 'trade', 'paperback', 'hardcover']);

const norm = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s: string) => norm(s).split(' ').filter(Boolean);
const significant = (s: string) => tokens(s).filter((t) => !STOP.has(t));
const numbersIn = (s: string) => new Set(tokens(s).filter((t) => /^\d+$/.test(t)));

const WORD_NUMBERS: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' };
const withDigits = (s: string) => tokens(s).map((t) => WORD_NUMBERS[t] ?? t).join(' ');

/** How well a scanned title lines up with a catalog title, 0..1. */
export function titleScore(scanned: string, volume: string | null, catalog: string): number {
  const q = withDigits(volume ? `${scanned} ${volume}` : scanned);
  const t = withDigits(catalog);
  if (!q || !t) return 0;

  // A different volume number is a different book, however similar the names.
  const qn = numbersIn(q);
  const tn = numbersIn(t);
  const numberClash = qn.size > 0 && tn.size > 0 && ![...qn].some((n) => tn.has(n));

  let score: number;
  if (norm(q) === norm(t)) score = 1;
  else {
    const qs = significant(q);
    const ts = significant(t);
    const phrase = (a: string[], b: string[]) => a.length >= 2 && ` ${b.join(' ')} `.includes(` ${a.join(' ')} `);
    if (phrase(qs, ts) || phrase(ts, qs)) score = 0.92;
    else {
      const inter = qs.filter((w) => ts.includes(w)).length;
      const union = new Set([...qs, ...ts]).size;
      score = union ? inter / union : 0;
      // One-word titles are matched only by equality, never by overlap ("Batman" is not every Batman book).
      if (qs.length < 2 || ts.length < 2) score = qs.join(' ') === ts.join(' ') && qs.length ? 0.95 : Math.min(score, 0.3);
    }
  }
  return numberClash ? score * 0.4 : score;
}

const MATCHED = 0.9;
const REVIEW = 0.6;
const TIE = 0.04;

export function matchScannedBooks(scanned: ScannedBook[], catalog: readonly CatalogTitle[]): ScanMatch[] {
  const out: ScanMatch[] = [];
  for (const book of scanned) {
    const ranked = catalog
      .map((c) => ({ c, score: titleScore(book.title, book.volume, c.title) }))
      .filter((x) => x.score >= REVIEW)
      // Best score first; on a tie prefer the plainer (shorter) title.
      .sort((a, b) => b.score - a.score || a.c.title.length - b.c.title.length || a.c.id.localeCompare(b.c.id));
    const best = ranked[0];
    if (!best) { out.push({ scanned: book, status: 'unmatched', workId: null, workTitle: null, score: 0 }); continue; }
    const ambiguous = ranked.length > 1 && best.score - ranked[1].score < TIE && ranked[1].c.id !== best.c.id;
    const confident = best.score >= MATCHED && book.confidence !== 'low' && !ambiguous;
    out.push({ scanned: book, status: confident ? 'matched' : 'review', workId: best.c.id, workTitle: best.c.title, score: best.score });
  }
  // Two photos of the same book must not add it twice: keep the strongest match per work.
  const seen = new Map<string, ScanMatch>();
  const result: ScanMatch[] = [];
  for (const m of out) {
    if (!m.workId) { result.push(m); continue; }
    const prev = seen.get(m.workId);
    if (!prev) { seen.set(m.workId, m); result.push(m); }
    else if (m.score > prev.score) { result[result.indexOf(prev)] = m; seen.set(m.workId, m); }
  }
  return result;
}

export interface ScanSummary { matched: number; review: number; unmatched: number; unreadable: number }

export function summarizeScan(matches: ScanMatch[], unreadable: number): ScanSummary {
  return {
    matched: matches.filter((m) => m.status === 'matched').length,
    review: matches.filter((m) => m.status === 'review').length,
    unmatched: matches.filter((m) => m.status === 'unmatched').length,
    unreadable,
  };
}
