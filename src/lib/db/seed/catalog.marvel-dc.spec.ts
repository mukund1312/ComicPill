import { describe, expect, it } from 'vitest';
import { CATALOG_EDGES, CATALOG_WORKS } from './catalog';

const normalize = (title: string) => title
  .toLowerCase()
  .replace(/^(the|a|an)\s+/, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

describe('Marvel/DC catalog expansion', () => {
  const additions = CATALOG_WORKS.filter((work) => /^(dc|marvel)-(800|1000)-/.test(work.id));

  it('adds exactly 200 distinct titles from each publisher', () => {
    expect(additions.filter((work) => work.publisher === 'DC')).toHaveLength(200);
    expect(additions.filter((work) => work.publisher === 'Marvel')).toHaveLength(200);
    expect(new Set(additions.map((work) => normalize(work.title))).size).toBe(additions.length);
    expect(new Set(additions.map((work) => work.id)).size).toBe(additions.length);
  });

  it('does not reuse a normalized title from the pre-existing catalog', () => {
    const previousTitles = new Set(CATALOG_WORKS
      .filter((work) => !/^(dc|marvel)-(800|1000)-/.test(work.id))
      .map((work) => normalize(work.title)));
    expect(additions.filter((work) => previousTitles.has(normalize(work.title))).map((work) => work.title)).toEqual([]);
  });

  it('keeps every seeded reading-order edge resolvable', () => {
    const workIds = new Set(CATALOG_WORKS.map((work) => work.id));
    expect(CATALOG_EDGES.filter((edge) => !workIds.has(edge.fromWork) || !workIds.has(edge.toWork))).toEqual([]);
  });
});
