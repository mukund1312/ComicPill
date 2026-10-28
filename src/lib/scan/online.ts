// Looking a comic up online, only when the reader asks. Open Library needs no account; Comic Vine is used too if the reader has added their own key.
// What is sent is the text they search for and nothing else. Results come from the services' own records (title, credits, ISBN, cover), and a comic
// picked here becomes an entry in the reader's own library only: it is never added to the built-in catalog. This file is the pure part
// (parsing, ranking, conversion) so it can be tested on saved real responses; the network calls are in the functions at the bottom.
import { normalizeIsbn, type ManualComic } from './manual';
import { fold, wordSimilarity } from './candidates';
import { LookupError, type ExternalSeries, type FetchLike } from '../mind/remote/types';
import { searchComicVine } from '../mind/remote/comicvine';

export type OnlineSource = 'openlibrary' | 'comicvine';
export type OnlineResult = {
  source: OnlineSource; id: string; title: string; authors: string[]; publisher: string | null; year: number | null; isbn13: string | null; pages: number | null;
  /** A picture of the cover from the service's own record, or null. Only addresses on the allowed hosts are ever fetched. */
  coverUrl: string | null;
};

/** Cover pictures are fetched only from these services, never from an address a response happens to contain. */
export const COVER_HOSTS = ['covers.openlibrary.org', 'comicvine.gamespot.com', 'static.comicvine.com'];
export function isAllowedCoverUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try { const u = new URL(url); return u.protocol === 'https:' && COVER_HOSTS.includes(u.hostname); } catch { return false; }
}

/** “Moench, Doug.” → “Doug Moench”. Names already in reading order are left alone. */
export function normalizeAuthor(name: string): string {
  const clean = name.replace(/\s+/g, ' ').trim().replace(/[.,;]+$/, '');
  const m = clean.match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2].trim()} ${m[1].trim()}` : clean;
}

/** The first valid ISBN in a list that mixes 10 and 13 digit forms, as an ISBN-13. */
export function pickIsbn13(isbns: unknown): string | null {
  if (!Array.isArray(isbns)) return null;
  const thirteen = isbns.filter((i): i is string => typeof i === 'string' && i.replace(/[\s-]/g, '').length === 13);
  for (const i of [...thirteen, ...isbns.filter((x): x is string => typeof x === 'string')]) { const n = normalizeIsbn(i); if (n) return n; }
  return null;
}

type OlDoc = { key?: string; title?: string; author_name?: string[]; first_publish_year?: number; publisher?: string[]; isbn?: string[]; cover_i?: number; number_of_pages_median?: number };

const text = (v: unknown, max = 160) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function parseOpenLibrary(json: unknown): OnlineResult[] {
  const docs = (json as { docs?: unknown })?.docs;
  if (!Array.isArray(docs)) return [];
  const out: OnlineResult[] = [];
  for (const d of docs as OlDoc[]) {
    const title = text(d?.title);
    if (!title) continue;
    const cover = typeof d.cover_i === 'number' && d.cover_i > 0 ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg?default=false` : null;
    out.push({
      source: 'openlibrary', id: text(d.key, 40) || title, title,
      authors: Array.isArray(d.author_name) ? d.author_name.map((a) => normalizeAuthor(text(a, 80))).filter(Boolean).slice(0, 4) : [],
      publisher: Array.isArray(d.publisher) ? text(d.publisher.find((p) => /comics|press|books|image|marvel|dark horse|idw|boom|viz|kodansha/i.test(p)) ?? d.publisher[0], 60) || null : null,
      year: typeof d.first_publish_year === 'number' && d.first_publish_year > 1800 ? d.first_publish_year : null,
      isbn13: pickIsbn13(d.isbn), pages: typeof d.number_of_pages_median === 'number' && d.number_of_pages_median > 0 ? d.number_of_pages_median : null, coverUrl: cover,
    });
  }
  return out;
}

/** Comic Vine volumes (a series, not one book) in the same shape, so they can sit in one list. */
export function fromComicVine(series: ExternalSeries[]): OnlineResult[] {
  return series.map((s) => ({
    source: 'comicvine' as const, id: s.externalId, title: s.title, authors: s.creators.slice(0, 4), publisher: s.publisher ?? null, year: s.year ?? null, isbn13: null, pages: null,
    coverUrl: isAllowedCoverUrl(s.coverUrl) ? s.coverUrl : null,
  }));
}

/** Put the results in a sensible order and drop repeats: words of the search found in the title and credits count, a cover and an ISBN help a little. */
export function rankResults(results: OnlineResult[], query: string, limit = 12): OnlineResult[] {
  const q = fold(query).filter((t) => t.length >= 2);
  const seen = new Set<string>();
  const scored = results.map((r, order) => {
    const words = fold(`${r.title} ${r.authors.join(' ')}`);
    const found = q.length ? q.reduce((n, t) => n + (words.some((w) => wordSimilarity(t, w) > 0) ? 1 : 0), 0) / q.length : 0;
    return { r, order, score: found + (r.coverUrl ? 0.05 : 0) + (r.isbn13 ? 0.03 : 0) };
  }).sort((a, b) => b.score - a.score || a.order - b.order);
  const out: OnlineResult[] = [];
  for (const { r } of scored) {
    const key = r.isbn13 ?? `${fold(r.title).join(' ')}|${r.year ?? ''}|${r.source}`;
    if (seen.has(key)) continue;
    seen.add(key); out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

/** The reader's own entry for a result they picked. They can still edit any of it. */
export function toManualComic(r: OnlineResult): ManualComic {
  return { title: r.title, series: null, volume: null, publisher: r.publisher, creators: r.authors.slice(0, 2), year: r.year, printing: 'trade_paperback', format: 'physical', isbn13: r.isbn13, pages: r.pages };
}

// ---- the network ---------------------------------------------------------------------------------------------------------------------

const UA = 'ComicPill/1.0 (personal comic collection app)';
const OPEN_LIBRARY = 'https://openlibrary.org/search.json';

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await run(controller.signal); } finally { clearTimeout(timer); }
}

export async function searchOpenLibrary(query: string, fetchImpl: FetchLike = fetch as unknown as FetchLike, timeoutMs = 8000): Promise<OnlineResult[]> {
  const url = `${OPEN_LIBRARY}?q=${encodeURIComponent(query)}&limit=12&fields=key,title,author_name,first_publish_year,publisher,isbn,cover_i,number_of_pages_median`;
  const res = await withTimeout(timeoutMs, (signal) => fetchImpl(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal }));
  if (res.status === 429) throw new LookupError('Open Library is busy. Try again in a moment.', 'rate_limited');
  if (!res.ok) throw new LookupError('Open Library had a problem.', 'server');
  return parseOpenLibrary(await res.json());
}

export type OnlineSearch = { results: OnlineResult[]; notes: string[]; reached: boolean };

/**
 * Search every source the reader can use, at the same time. One source failing doesn't hide what the other found; the notes say what went wrong
 * in plain words. `reached` is false only if nothing could be contacted at all (the device is probably offline).
 */
export async function searchOnline(query: string, opts: { comicVineKey?: string | null; fetchImpl?: FetchLike; timeoutMs?: number } = {}): Promise<OnlineSearch> {
  const q = query.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (q.length < 2) return { results: [], notes: [], reached: true };
  const fetchImpl = opts.fetchImpl ?? (fetch as unknown as FetchLike);
  const jobs: { name: string; run: Promise<OnlineResult[]> }[] = [{ name: 'Open Library', run: searchOpenLibrary(q, fetchImpl, opts.timeoutMs) }];
  if (opts.comicVineKey) jobs.push({ name: 'Comic Vine', run: searchComicVine(q, opts.comicVineKey, fetchImpl).then(fromComicVine) });
  const settled = await Promise.allSettled(jobs.map((j) => j.run));
  const results: OnlineResult[] = []; const notes: string[] = []; let reached = false;
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') { reached = true; results.push(...s.value); return; }
    const e = s.reason;
    const aborted = e instanceof Error && e.name === 'AbortError';
    notes.push(e instanceof LookupError && e.kind !== 'network' ? e.message : aborted ? `${jobs[i].name} took too long to answer.` : `Couldn’t reach ${jobs[i].name}.`);
    if (e instanceof LookupError && e.kind !== 'network') reached = true; // it answered, just not with results
  });
  return { results: rankResults(results, q), notes, reached };
}
