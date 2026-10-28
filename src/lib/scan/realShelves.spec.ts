import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readShelf, type ReadPass } from './spines';
import truth from './__fixtures__/real-shelf-truth.json';

// Four real photos of comic shelves (standing books, a pile lying flat, thin paperbacks, 25+ spines) were read by the device's text
// recognition; the lines it found are saved here with a hand-made answer key. These numbers are a floor to guard against getting worse:
// raise them as recognition improves.
const fx = (n: number) => JSON.parse(readFileSync(new URL(`./__fixtures__/real-shelf-${n}.json`, import.meta.url), 'utf8')) as { passes: ReadPass[] };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9/]+/g, ' ').trim();

function recall(n: number): { found: number; total: number; groups: number } {
  const books = readShelf(fx(n).passes);
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
  it.each([[22, 6], [23, 10], [24, 13], [25, 15]])('photo %i: finds at least %i of its books', (n, floor) => {
    const r = recall(n);
    expect(r.found).toBeGreaterThanOrEqual(floor);
  });
  it('splits a pile of flat books into about as many groups as there are books (not one big group)', () => {
    const r = recall(23);
    expect(r.groups).toBeGreaterThanOrEqual(10);
    expect(r.groups).toBeLessThanOrEqual(20);
  });
});
