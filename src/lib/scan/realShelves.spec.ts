import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readShelf, type ReadPass } from './spines';
import truth from './__fixtures__/real-shelf-truth.json';

// Four real photos of comic shelves (standing books, a pile lying flat, thin paperbacks, 25+ spines) were read by the device's text
// recognition; the lines it found are saved here with a hand-made answer key. These numbers are a floor to guard against getting worse:
// raise them as recognition improves.
const DIMS: Record<number, [number, number]> = { 22: [640, 853], 23: [640, 853], 24: [640, 586], 25: [640, 538] };
const gray = (n: number) => ({ data: new Uint8Array(readFileSync(new URL(`./__fixtures__/gray${n}.bin`, import.meta.url))), width: DIMS[n][0], height: DIMS[n][1] });
const fx = (n: number) => JSON.parse(readFileSync(new URL(`./__fixtures__/real-shelf-${n}.json`, import.meta.url), 'utf8')) as { passes: ReadPass[] };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9/]+/g, ' ').trim();

function recall(n: number, withEdges = true): { found: number; total: number; groups: number } {
  const books = readShelf(fx(n).passes, withEdges ? gray(n) : undefined);
  const used = new Set<number>();
  let found = 0;
  const key = (truth as Record<string, { books: string[][] }>)[String(n)].books;
  for (const alts of key) {
    const hit = books.findIndex((b, i) => !used.has(i) && alts.some((a) => norm(`${b.title} ${b.rawText}`).includes(a)));
    if (hit >= 0) { used.add(hit); found++; }
  }
  return { found, total: key.length, groups: books.length };
}

describe('real shelf photos', () => {
  it.each([[22, 7], [23, 10], [24, 14], [25, 14]])('photo %i: finds at least %i of its books', (n, floor) => {
    const r = recall(n);
    expect(r.found).toBeGreaterThanOrEqual(floor);
  });
  it('splits a pile of flat books into about as many groups as there are books (not one big group)', () => {
    const r = recall(23);
    expect(r.groups).toBeGreaterThanOrEqual(10);
    expect(r.groups).toBeLessThanOrEqual(20);
  });
});

describe('real shelf photos: cutting the shelf from the picture', () => {
  it('finds at least as many books overall as grouping by lettering alone', () => {
    const withEdges = [22, 23, 24, 25].reduce((n, p) => n + recall(p, true).found, 0);
    const lettering = [22, 23, 24, 25].reduce((n, p) => n + recall(p, false).found, 0);
    expect(withEdges).toBeGreaterThanOrEqual(lettering);
  });
  it('gives every book a box that spans its spine, not just its lettering', () => {
    for (const n of [24, 25]) {
      const books = readShelf(fx(n).passes, gray(n));
      const tall = books.filter((b) => b.box.h >= 0.4).length;
      expect(tall / books.length).toBeGreaterThan(0.8); // spines are tall; lettering-only boxes were often a fraction of that
    }
  });
});

// ---- matching against the catalog, end to end -------------------------------------------------------------------------
import { buildIndex, decide, fold, rankCandidates } from './candidates';

const seed = (f: string) => JSON.parse(readFileSync(new URL(`../db/seed/${f}`, import.meta.url), 'utf8')) as { id: string; title: string; creators?: string[] }[];
const catalog = [...seed('catalog.data.json'), ...seed('catalog.popular.data.json')].map((w) => ({ id: w.id, title: w.title, creators: w.creators ?? [] }));

describe('real shelf photos: matching to the catalog', () => {
  const index = buildIndex(catalog);
  const tally = { automaticRight: 0, automaticWrong: 0, suggestedRight: 0, total: 0 };
  for (const n of [22, 23, 24, 25]) {
    const books = readShelf(fx(n).passes, gray(n));
    const key = (truth as Record<string, { books: string[][] }>)[String(n)].books;
    const used = new Set<number>();
    tally.total += key.length;
    for (const b of books) {
      const d = decide(rankCandidates(b, index));
      const at = (title: string) => key.findIndex((alts, k) => !used.has(k) && alts.some((a) => fold(title).join(' ').includes(fold(a).join(' '))));
      if (!d.best) continue;
      if (d.strength === 'strong' || d.strength === 'likely') { const i = at(d.best.title); if (i >= 0) { used.add(i); tally.automaticRight++; } else tally.automaticWrong++; }
      else { const i = [d.best, ...d.alternatives].map((c) => at(c.title)).find((x) => x >= 0); if (i !== undefined && i >= 0) { used.add(i); tally.suggestedRight++; } }
    }
  }
  it('is right far more often than wrong when it decides on its own', () => {
    expect(tally.automaticRight).toBeGreaterThanOrEqual(20);
    expect(tally.automaticWrong).toBeLessThanOrEqual(3);
  });
  it('helps with about half of the real books on these shelves (the rest aren’t in the catalog or can’t be read)', () => {
    expect(tally.automaticRight + tally.suggestedRight).toBeGreaterThanOrEqual(33);
  });
});
