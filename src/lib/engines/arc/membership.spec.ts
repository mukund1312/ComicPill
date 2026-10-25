import { describe, expect, it } from 'vitest';
import { buildArc } from './build';
import { buildMembershipIndex, nextSteps, primaryMembership, readGuidance } from './membership';
import { BATMAN_FAMILY_ARC } from './templates';
import type { ArcLibrary, ArcLibraryEntry } from './types';
import { DEV_LIBRARY_ENTRIES } from '../../db/seed/catalog';

const devShelf: ArcLibrary = new Map(DEV_LIBRARY_ENTRIES.map((e) => [e.workId, { status: e.status, own: e.own }]));
const lib = (o: Record<string, Partial<ArcLibraryEntry>>): ArcLibrary =>
  new Map(Object.entries(o).map(([id, e]) => [id, { status: 'none', own: 'none', ...e } as ArcLibraryEntry]));

const plan = buildArc(BATMAN_FAMILY_ARC, 'recommended', devShelf);
const arcs = [{ id: 'a1', plan }];

describe('membership index', () => {
  const idx = buildMembershipIndex(arcs);

  it('marks exactly one book as the next step, and it is Dark Victory for the real shelf', () => {
    const next = [...idx.values()].flat().filter((m) => m.isNext);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ workId: 'dark-victory', chapterTitle: 'The First Robin', arcId: 'a1' });
  });

  it('records the book before, for "recommended after X"', () => {
    expect(idx.get('robin-year-one')![0].previousWorkId).toBe('dark-victory');
    expect(idx.get('year-one')![0].previousWorkId).toBeNull();
  });

  it('leaves endgame-branch books out — they are choices, not steps', () => {
    expect(idx.has('dark-knight-returns')).toBe(false);
    expect(idx.has('white-knight')).toBe(false);
  });

  it('carries state and progress', () => {
    expect(idx.get('year-one')![0].state).toBe('finished');
    expect(idx.get('dark-victory')![0].percentComplete).toBe(plan.percentComplete);
  });

  it('prefers the journey where the book is next, then any where it is unread', () => {
    const other = buildArc(BATMAN_FAMILY_ARC, 'essential', new Map());
    const both = buildMembershipIndex([{ id: 'fresh', plan: other }, { id: 'a1', plan }]);
    expect(primaryMembership(both.get('dark-victory'))!.arcId).toBe('a1'); // next in a1, not in fresh
    expect(primaryMembership(undefined)).toBeNull();
  });

  it('lists each journey\'s next step', () => {
    const steps = nextSteps(arcs);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ workId: 'dark-victory', accessible: true, own: 'physical' });
  });

  it('reports a not-owned next step as not accessible', () => {
    const p = buildArc(BATMAN_FAMILY_ARC, 'recommended', lib({ 'year-one': { status: 'done' }, 'man-who-laughs': { status: 'done' }, 'long-halloween': { status: 'done' } }));
    expect(nextSteps([{ id: 'x', plan: p }])[0]).toMatchObject({ workId: 'dark-victory', accessible: false });
  });
});

describe('readGuidance — the reading path informs buying', () => {
  it('says WAIT for Robin: Year One while Dark Victory is owned and unread (the spec example)', () => {
    expect(readGuidance(plan, 'robin-year-one')).toEqual({ kind: 'wait', becauseWorkId: 'dark-victory' });
  });

  it('says WAIT for a much later book too, naming the first thing already in hand', () => {
    expect(readGuidance(plan, 'death-in-family')).toEqual({ kind: 'wait', becauseWorkId: 'dark-victory' });
  });

  it('a later book he already owns is simply in hand (Under the Red Hood is on his shelf)', () => {
    expect(readGuidance(plan, 'under-red-hood')).toEqual({ kind: 'in_hand' });
  });

  it('does not tell you to wait when nothing you own stands in the way', () => {
    const empty = buildArc(BATMAN_FAMILY_ARC, 'recommended', new Map());
    expect(readGuidance(empty, 'year-one')).toEqual({ kind: 'consider_buying' });
  });

  it('needs no advice for books you can already read or have finished', () => {
    expect(readGuidance(plan, 'dark-victory')).toEqual({ kind: 'in_hand' });
    expect(readGuidance(plan, 'year-one')).toEqual({ kind: 'done' });
  });

  it('is not about books outside the journey', () => {
    expect(readGuidance(plan, 'watchmen')).toEqual({ kind: 'not_in_journey' });
  });

  it('treats endgame books as coming after the whole main path', () => {
    expect(readGuidance(plan, 'white-knight')).toEqual({ kind: 'wait', becauseWorkId: 'dark-victory' });
    const done = buildArc(BATMAN_FAMILY_ARC, 'recommended', lib({}));
    expect(readGuidance(done, 'dark-knight-returns')).toEqual({ kind: 'consider_buying' });
  });

  it('a dropped blocker no longer blocks', () => {
    const p = buildArc(BATMAN_FAMILY_ARC, 'recommended', lib({
      'year-one': { status: 'done' }, 'man-who-laughs': { status: 'done' }, 'long-halloween': { status: 'done' },
      'dark-victory': { status: 'dropped', own: 'physical' },
    }));
    expect(readGuidance(p, 'robin-year-one')).toEqual({ kind: 'consider_buying' });
  });
});
