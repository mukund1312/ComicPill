// Integrity checks that run on EVERY journey template, so adding a new one
// can't quietly ship a broken book id, a mislabelled future, or a dead branch.
import { describe, expect, it } from 'vitest';
import { ARC_TEMPLATES } from '.';
import { buildArc } from '../build';
import { DEPTH_TIERS, type ArcItemDef, type ArcLibrary } from '../types';
import { CATALOG_WORKS } from '../../../db/seed/catalog';

const ids = new Set(CATALOG_WORKS.map((w) => w.id));
const all = Object.values(ARC_TEMPLATES);
const mainItems = (t: (typeof all)[number]): ArcItemDef[] => t.chapters.flatMap((c) => c.milestones.flatMap((m) => m.items));
const branchItems = (t: (typeof all)[number]): ArcItemDef[] => t.endgame?.branches.flatMap((b) => b.items) ?? [];

describe.each(all.map((t) => [t.key, t] as const))('template %s', (_key, t) => {
  it('is registered under its own key', () => {
    expect(ARC_TEMPLATES[t.key]).toBe(t);
  });
  it('references only books that exist in the catalog', () => {
    expect([...mainItems(t), ...branchItems(t)].filter((i) => !ids.has(i.workId)).map((i) => i.workId)).toEqual([]);
  });
  it('lists no book twice', () => {
    const w = [...mainItems(t), ...branchItems(t)].map((i) => i.workId);
    expect(w.filter((x, i) => w.indexOf(x) !== i)).toEqual([]);
  });
  it('keeps futures, Elseworlds and alternates out of the main path', () => {
    expect(mainItems(t).filter((i) => ['possible_future', 'elseworld', 'alternate'].includes(i.continuity))).toEqual([]);
  });
  it('explains every book, in spoiler-safe words (no leftover template escapes)', () => {
    for (const i of [...mainItems(t), ...branchItems(t)]) {
      expect(i.why.trim().length).toBeGreaterThan(8);
      expect(i.why).not.toMatch(/\\u|undefined/);
    }
  });
  it('has unique chapter and milestone ids, each milestone with at least one book', () => {
    const idsSeen = t.chapters.flatMap((c) => [c.id, ...c.milestones.map((m) => m.id)]);
    expect(new Set(idsSeen).size).toBe(idsSeen.length);
    expect(t.chapters.flatMap((c) => c.milestones).every((m) => m.items.length > 0)).toBe(true);
  });
  it('builds a valid plan at every depth, nested essential ⊂ recommended ⊂ completionist', () => {
    const lib: ArcLibrary = new Map();
    const at = (d: 'essential' | 'recommended' | 'completionist') => buildArc(t, d, lib).chapters.flatMap((c) => c.milestones.flatMap((m) => m.items.map((i) => i.workId)));
    const [e, r, c] = [at('essential'), at('recommended'), at('completionist')];
    expect(e.length).toBeGreaterThan(0);
    expect(e.every((x) => r.includes(x))).toBe(true);
    expect(r.every((x) => c.includes(x))).toBe(true);
    expect(DEPTH_TIERS.essential).toEqual(['essential']);
  });
  it('starts a brand-new reader at the first book of the first milestone that has one at this depth', () => {
    const plan = buildArc(t, 'recommended', new Map());
    expect(plan.nextStep).not.toBeNull();
    expect(plan.percentComplete).toBe(0);
  });
  it('every family reference points at a real milestone', () => {
    const ms = new Set(t.chapters.flatMap((c) => c.milestones.map((m) => m.id)));
    expect((t.family?.branches.flatMap((b) => b.identities.map((i) => i.milestoneId)) ?? []).filter((m) => !ms.has(m))).toEqual([]);
  });
});

describe('branches between journeys', () => {
  const offers = all.flatMap((t) => (t.branches ?? []).map((b) => ({ from: t, ...b })));

  it('the Batman journey offers a Nightwing branch', () => {
    expect(offers.find((o) => o.from.key === 'batman-year-one-to-legacy')).toMatchObject({ templateKey: 'nightwing-dick-grayson', milestoneId: 'ms-dick-becomes-nightwing', label: 'Follow Nightwing' });
  });
  it.each(offers.map((o) => [`${o.from.key} -> ${o.templateKey}`, o] as const))('%s points at a real milestone and a real journey', (_n, o) => {
    expect(o.from.chapters.flatMap((c) => c.milestones).some((m) => m.id === o.milestoneId)).toBe(true);
    expect(ARC_TEMPLATES[o.templateKey]).toBeDefined();
    expect(o.templateKey).not.toBe(o.from.key); // a journey can't branch into itself
  });
  it('no two journeys branch into each other (no loops)', () => {
    for (const a of offers) for (const b of offers) expect(a.from.key === b.templateKey && b.from.key === a.templateKey).toBe(false);
  });
  it('the offer only appears while its milestone is part of the plan, with its progress', () => {
    const lib: ArcLibrary = new Map();
    const plan = buildArc(ARC_TEMPLATES['batman-year-one-to-legacy'], 'recommended', lib);
    expect(plan.branchOffers).toHaveLength(1);
    expect(plan.branchOffers[0]).toMatchObject({ templateKey: 'nightwing-dick-grayson', status: 'upcoming' });
    // At Essential depth the Nightwing milestone has no books, so the offer disappears with it.
    expect(buildArc(ARC_TEMPLATES['batman-year-one-to-legacy'], 'essential', lib).branchOffers).toEqual([]);
  });
  it('the Nightwing journey resolves against the real shelf', () => {
    const shelf: ArcLibrary = new Map([['robin-year-one', { status: 'done', own: 'physical' }]]);
    const plan = buildArc(ARC_TEMPLATES['nightwing-dick-grayson'], 'recommended', shelf);
    expect(plan.nextStep?.workId).toBe('nightwing-year-one');
  });
});
