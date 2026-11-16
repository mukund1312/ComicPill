// Which series a comic file belongs to, and its issue number: from the file's own ComicInfo when it has one, otherwise from its title
// ("Saga #012", "Saga 012 (2013)", "Saga v2 012", "Saga - Issue 12"). Used to group the shelf by series and to find the next issue.

export type SeriesInfo = {
  /** Lower-cased, tidied series name: comics with the same key are one series. */
  key: string;
  /** The series name to show. */
  name: string;
  /** Issue number, when there is one (1, 12, 12.5…). */
  number: number | null;
};

type Comicish = { id: string; title: string; series?: string | null; issue?: string | null };

const tidy = (s: string) => s
  .replace(/\.(cbz|cbr|cb7|zip|rar|7z|pdf|epub)$/i, '')
  .replace(/[_]+/g, ' ')
  .replace(/\((?:19|20)\d{2}\)/g, ' ') // a year in brackets
  .replace(/\((?:digital|webrip|c2c|f)\)|\[[^\]]*\]/gi, ' ') // scanner tags
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/[\s\-–:,.]+$/, '');

const isYear = (digits: string) => digits.length === 4 && +digits >= 1900 && +digits <= 2100;

/** Series name and issue number from a title or file name, or null when it doesn't look like one issue of a series. */
export function parseIssueTitle(raw: string): { name: string; number: number } | null {
  const t = tidy(raw);
  // "Name #12", "Name No. 12", "Name Issue 12", "Name - Chapter 12"
  let m = /^(.+?)\s*(?:#|\bno\.?\s*|\bissue\s+|\bchapter\s+|\bch\.?\s*)(\d+(?:\.\d+)?)\b/i.exec(t);
  if (m && m[1].trim()) return { name: tidy(m[1]), number: Number(m[2]) };
  // "Name 012", "Name v2 012", "Name 012 (of 6)": a trailing number that isn't a year
  m = /^(.+?)\s+(?:v(?:ol(?:ume)?)?\.?\s*\d+\s+)?(\d{1,4}(?:\.\d+)?)(?:\s*\(of\s+\d+\))?$/i.exec(t);
  if (m && m[1].trim() && !isYear(m[2]) && !/^\d+$/.test(m[1].trim())) return { name: tidy(m[1]), number: Number(m[2]) };
  return null;
}

const keyOf = (name: string) => name.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** The comic's series, preferring what the file itself says. Null when it isn't part of a recognisable series. */
export function seriesOf(c: Comicish): SeriesInfo | null {
  if (c.series && c.series.trim()) {
    const n = c.issue != null && c.issue !== '' && !Number.isNaN(Number(c.issue)) ? Number(c.issue) : parseIssueTitle(c.title)?.number ?? null;
    return { key: keyOf(c.series), name: c.series.trim(), number: n };
  }
  const p = parseIssueTitle(c.title);
  return p ? { key: keyOf(p.name), name: p.name, number: p.number } : null;
}

export type SeriesGroup<T> = { key: string; name: string; issues: T[] };
export type ShelfEntry<T> = { kind: 'series'; group: SeriesGroup<T> } | { kind: 'comic'; comic: T };

/**
 * The shelf as series: comics sharing a series (two or more issues) become one group, sorted by issue number; everything else stays a
 * single comic. Groups keep the order in which their first comic appears in `comics` (so a "recently read" shelf stays recent-first).
 */
export function groupBySeries<T extends Comicish>(comics: T[]): ShelfEntry<T>[] {
  const groups = new Map<string, { name: string; items: T[] }>();
  const info = new Map<string, SeriesInfo | null>();
  for (const c of comics) {
    const s = seriesOf(c); info.set(c.id, s);
    if (!s) continue;
    const g = groups.get(s.key);
    if (g) g.items.push(c); else groups.set(s.key, { name: s.name, items: [c] });
  }
  const out: ShelfEntry<T>[] = [];
  const placed = new Set<string>();
  for (const c of comics) {
    const s = info.get(c.id);
    const g = s ? groups.get(s.key) : undefined;
    if (!s || !g || g.items.length < 2) { out.push({ kind: 'comic', comic: c }); continue; }
    if (placed.has(s.key)) continue;
    placed.add(s.key);
    out.push({ kind: 'series', group: { key: s.key, name: g.name, issues: sortIssues(g.items) } });
  }
  return out;
}

/** Issues in reading order: by number, unnumbered ones last in title order. */
export function sortIssues<T extends Comicish>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const na = seriesOf(a)?.number ?? null; const nb = seriesOf(b)?.number ?? null;
    if (na != null && nb != null && na !== nb) return na - nb;
    if (na == null && nb != null) return 1;
    if (nb == null && na != null) return -1;
    return a.title.localeCompare(b.title, undefined, { numeric: true });
  });
}

/** The issue to read after `current`: the same series' next number on the shelf, or null. */
export function nextIssue<T extends Comicish>(current: Comicish, all: T[]): T | null {
  const s = seriesOf(current);
  if (!s) return null;
  const same = sortIssues(all.filter((c) => c.id !== current.id && seriesOf(c)?.key === s.key));
  if (s.number != null) return same.find((c) => { const n = seriesOf(c)?.number; return n != null && n > s.number!; }) ?? null;
  return null;
}
