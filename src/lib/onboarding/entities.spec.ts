import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ART_STYLES, CHARACTERS, CREATORS, GENRE_CARDS, RELATIONSHIPS, STORY_TRAITS } from './entities';
import { CATALOG_WORKS } from '../db/seed/catalog';
import { DIMENSIONS } from '../types/domain';

const coverKeys = new Set([...readFileSync(join(__dirname, '..', '..', 'ui', 'coverAssets.ts'), 'utf8').matchAll(/^\s*'([^']+)': require/gm)].map((m) => m[1]));
const work = new Map(CATALOG_WORKS.map((w) => [w.id, w]));
const charNames = new Set(CATALOG_WORKS.flatMap((w) => w.characters));
const creatorNames = new Set(CATALOG_WORKS.flatMap((w) => w.creators));
const genreVocab = new Set(CATALOG_WORKS.flatMap((w) => w.genres));

const allIds = [...CHARACTERS, ...CREATORS, ...ART_STYLES, ...GENRE_CARDS, ...STORY_TRAITS].map((e) => e.id);

describe('entity ids', () => {
  it('are unique across every kind', () => {
    expect(allIds.filter((id, i) => allIds.indexOf(id) !== i)).toEqual([]);
  });
  it('are namespaced by kind so a signal can never be mistaken for another', () => {
    for (const c of CHARACTERS) expect(c.id).toMatch(/^char:/);
    for (const c of CREATORS) expect(c.id).toMatch(/^creator:/);
    for (const a of ART_STYLES) expect(a.id).toMatch(/^style:/);
    for (const x of GENRE_CARDS) expect(x.id).toMatch(/^genre:/);
    for (const x of STORY_TRAITS) expect(x.id).toMatch(/^trait:/);
  });
});

describe('every picture is a real bundled cover', () => {
  const refs: [string, string][] = [
    ...CHARACTERS.map((c) => [c.id, c.signatureWorkId] as [string, string]),
    ...CREATORS.map((c) => [c.id, c.signatureWorkId] as [string, string]),
    ...ART_STYLES.map((a) => [a.id, a.exemplarWorkId] as [string, string]),
    ...GENRE_CARDS.map((x) => [x.id, x.exemplarWorkId] as [string, string]),
  ];
  it('points at a work that exists in the catalog', () => {
    expect(refs.filter(([, w]) => !work.has(w))).toEqual([]);
  });
  it('and that work has a bundled cover image', () => {
    expect(refs.filter(([, w]) => !coverKeys.has(w))).toEqual([]);
  });
});

describe('characters', () => {
  it('each name matches the catalog’s own metadata, so a stated like can change a recommendation', () => {
    expect(CHARACTERS.filter((c) => !c.catalogNames.some((n) => charNames.has(n))).map((c) => c.name)).toEqual([]);
  });
  it('each one’s signature book actually features them (or is a title they carry)', () => {
    const bad = CHARACTERS.filter((c) => {
      const w = work.get(c.signatureWorkId)!;
      const inMeta = c.catalogNames.some((n) => w.characters.includes(n));
      const inTitle = [c.name, ...(c.aliases ?? [])].some((n) => w.title.toLowerCase().includes(n.toLowerCase()));
      return !inMeta && !inTitle;
    }).map((c) => `${c.name} -> ${c.signatureWorkId}`);
    expect(bad).toEqual([]);
  });
  it('have valid popularity and alignment', () => {
    for (const c of CHARACTERS) {
      expect(c.popularity).toBeGreaterThan(0);
      expect(c.popularity).toBeLessThanOrEqual(1);
      expect(['hero', 'villain', 'antihero', 'neutral', 'variable']).toContain(c.alignment);
    }
  });
  it('offer enough of each kind to fill a screen', () => {
    const n = (f: (c: (typeof CHARACTERS)[number]) => boolean) => CHARACTERS.filter(f).length;
    expect(n((c) => c.alignment !== 'villain')).toBeGreaterThanOrEqual(24);
    expect(n((c) => c.alignment === 'villain' || c.alignment === 'variable')).toBeGreaterThanOrEqual(10);
    expect(new Set(CHARACTERS.map((c) => c.publisher)).size).toBeGreaterThanOrEqual(3);
  });
});

describe('relationships', () => {
  const ids = new Set(CHARACTERS.map((c) => c.id));
  it('only join known characters, never a character to itself', () => {
    expect(RELATIONSHIPS.filter((r) => !ids.has(r.from) || !ids.has(r.to) || r.from === r.to)).toEqual([]);
  });
  it('have a strength between 0 and 1', () => {
    expect(RELATIONSHIPS.filter((r) => !(r.strength > 0 && r.strength <= 1))).toEqual([]);
  });
  it('are not listed twice (in either direction)', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const r of RELATIONSHIPS) {
      const key = [r.from, r.to].sort().join('|');
      if (seen.has(key)) dupes.push(key);
      seen.add(key);
    }
    expect(dupes).toEqual([]);
  });
  it('connect every character to at least one other, so discovery can always find a neighbour', () => {
    const linked = new Set(RELATIONSHIPS.flatMap((r) => [r.from, r.to]));
    expect(CHARACTERS.filter((c) => !linked.has(c.id)).map((c) => c.name)).toEqual([]);
  });
  it('give every villain a hero they are actually tied to', () => {
    const byId = new Map(CHARACTERS.map((c) => [c.id, c]));
    const villains = CHARACTERS.filter((c) => c.alignment === 'villain');
    const orphaned = villains.filter((v) => !RELATIONSHIPS.some((r) => (r.from === v.id || r.to === v.id) && [r.from, r.to].some((id) => id !== v.id && byId.get(id)!.alignment !== 'villain')));
    expect(orphaned.map((v) => v.name)).toEqual([]);
  });
});

describe('creators', () => {
  it('each appears in the catalog’s creator metadata', () => {
    expect(CREATORS.filter((c) => !creatorNames.has(c.name)).map((c) => c.name)).toEqual([]);
  });
  it('is credited on their own signature book', () => {
    expect(CREATORS.filter((c) => !work.get(c.signatureWorkId)!.creators.includes(c.name)).map((c) => `${c.name} -> ${c.signatureWorkId}`)).toEqual([]);
  });
  it('has enough artists and writers for a screen each', () => {
    expect(CREATORS.filter((c) => c.roles.includes('artist')).length).toBeGreaterThanOrEqual(12);
    expect(CREATORS.filter((c) => c.roles.includes('writer')).length).toBeGreaterThanOrEqual(12);
  });
});

describe('art styles, genres and traits', () => {
  it('seed only real dimensions, with values in range', () => {
    for (const e of [...ART_STYLES, ...STORY_TRAITS]) {
      for (const [dim, v] of Object.entries(e.seeds)) {
        expect(DIMENSIONS).toContain(dim);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
  it('every art style says something about how it looks (it seeds at least one dimension)', () => {
    expect(ART_STYLES.filter((a) => Object.keys(a.seeds).length === 0)).toEqual([]);
  });
  it('genre cards map only to genres the catalog really uses', () => {
    expect(GENRE_CARDS.flatMap((x) => x.genres).filter((gn) => !genreVocab.has(gn))).toEqual([]);
    expect(STORY_TRAITS.flatMap((x) => x.genres).filter((gn) => !genreVocab.has(gn))).toEqual([]);
  });
  it('offers the twelve art styles the design calls for', () => {
    expect(ART_STYLES).toHaveLength(12);
  });
});
