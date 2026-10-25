// The screenshot scenario against the REAL catalog, edges, dev shelf and
// Batman journey — no hand-made fixtures. If the seed data or the journey
// wiring drifts so Compare stops understanding the reader, this fails.
import { describe, expect, it } from 'vitest';
import { decideRead } from './decide';
import { candidateFor, indexPredecessors, journeyFromMembership, type World } from './build';
import { challengeFor } from './challenge';
import type { ComparisonContext, ReadingState } from './types';
import { buildArc } from '../../arc/build';
import { buildMembershipIndex, primaryMembership } from '../../arc/membership';
import { BATMAN_FAMILY_ARC } from '../../arc/templates';
import type { ArcLibrary } from '../../arc/types';
import { emptyProfile } from '../../taste/profile';
import type { Dim } from '../../../types/domain';
import type { ScorableWork } from '../../../types/engine-io';
import {
  CATALOG_EDGES, CATALOG_PATH_ITEMS, CATALOG_WORKS, DEV_LIBRARY_ENTRIES,
} from '../../../db/seed/catalog';

// Your shelf as in the screenshots: Birthright and Absolute Batman finished.
const shelf = new Map(DEV_LIBRARY_ENTRIES.map((e) => [e.workId, { status: e.status, own: e.own }]));
shelf.set('birthright', { status: 'done', own: 'both' });
const lib: ArcLibrary = shelf;

const laneOf = new Map(CATALOG_PATH_ITEMS.map((p) => [p.workId, p.pathId.replace(/^path-/, '')]));
const works = new Map<string, ScorableWork>(CATALOG_WORKS.map((w) => [w.id, {
  id: w.id, title: w.title, bucket: laneOf.get(w.id) ?? 'other', universe: w.universe,
  fingerprint: w.fingerprint as Record<Dim, number>, genres: w.genres as ScorableWork['genres'],
  creators: w.creators, characters: w.characters, contextNeeded: 'none', requiredParentIds: [],
  own: shelf.get(w.id)?.own ?? 'none', keeper: w.keeperFlag, pricePaise: null, formatVerdict: 'physical',
}]));

const plan = buildArc(BATMAN_FAMILY_ARC, 'recommended', lib);
const memberships = buildMembershipIndex([{ id: 'journey-1', plan }]);
const stateOf = (id: string): ReadingState => {
  const s = shelf.get(id)?.status ?? 'none';
  return s === 'done' ? 'finished' : s === 'none' ? 'unread' : s;
};
const world: World = {
  works, state: stateOf,
  predecessorEdges: indexPredecessors(CATALOG_EDGES),
  journey: (id) => journeyFromMembership(primaryMembership(memberships.get(id))),
};
const ctx = (over: Partial<ComparisonContext> = {}): ComparisonContext => ({
  profile: emptyProfile(), mood: null, intent: 'best', travelMode: 'any', rereadsAllowed: false,
  recentFinished: [], currentlyReading: [], activeJourneys: [plan.title],
  titleById: new Map([...works].map(([id, w]) => [id, w.title])), ...over,
});
const candidates = (ids: string[]) => ids.map((id) => candidateFor(id, world)!).filter(Boolean);

describe('real catalog: Birthright / Absolute Batman / The Cult / Dark Victory', () => {
  const ids = ['birthright', 'abs-batman-1', 'cult', 'dark-victory'];
  const d = decideRead(candidates(ids), ctx());

  it('knows Dark Victory follows a book the reader finished', () => {
    const dv = candidateFor('dark-victory', world)!;
    expect(dv.predecessors).toEqual([{ workId: 'long-halloween', title: 'Batman: The Long Halloween', state: 'finished', kind: 'direct_sequel' }]);
    expect(dv.journey?.isNext).toBe(true);
    expect(dv.journey?.chapterTitle).toBe('The First Robin');
  });

  it('does not rank the two finished books', () => {
    expect(d.excluded.map((e) => e.workId).sort()).toEqual(['abs-batman-1', 'birthright']);
    expect(d.order.map((e) => e.workId)).toEqual(['dark-victory', 'cult']);
  });

  it('picks Dark Victory and says why, in the reader’s own terms', () => {
    expect(d.primary?.title).toBe('Batman: Dark Victory');
    expect(d.primary?.headline).toBe('Continue your Batman journey.');
    expect(d.primary?.explanation).toContain('Continues directly from Batman: The Long Halloween');
    expect(d.primary?.explanation).toContain('Batman: From Year One to Legacy');
    expect(d.primary?.status).toBe('Physical • Owned • Unread');
    expect(d.thenNext?.title).toBe('Batman: The Cult');
  });

  it('Path relevance is no longer "Low for everything": Dark Victory is Excellent, The Cult is Low', () => {
    const goal = (id: string) => d.order.find((e) => e.workId === id)!.dimensions.find((x) => x.key === 'goal')!.label;
    expect(goal('dark-victory')).toBe('Excellent');
    expect(goal('cult')).toBe('Low');
  });

  it('with no journey at all, it does not invent one', () => {
    const noJourney: World = { ...world, journey: () => null };
    const plain = decideRead(ids.map((id) => candidateFor(id, noJourney)!), ctx({ activeJourneys: [] }));
    expect(plain.primary?.explanation).not.toMatch(/journey/i);
    expect(plain.excluded).toHaveLength(2); // finished books are still excluded
  });

  it('a wider comparison including a later book keeps the story order', () => {
    const wide = decideRead(candidates(['robin-year-one', 'dark-victory', 'under-red-hood']), ctx());
    const titles = wide.order.map((e) => e.workId);
    expect(titles.indexOf('dark-victory')).toBeLessThan(titles.indexOf('robin-year-one'));
  });
});

describe('challenge: a better book you already own', () => {
  const pool = () => [...works.keys()]
    .filter((id) => stateOf(id) !== 'finished' && (shelf.get(id)?.own ?? 'none') !== 'none')
    .map((id) => candidateFor(id, world)!);

  it('interrupts when every chosen book is worse than something owned', () => {
    const chosen = decideRead(candidates(['birthright', 'abs-batman-1']), ctx()); // both finished
    const ch = challengeFor(chosen, decideRead(pool(), ctx()));
    expect(ch).not.toBeNull();
    expect(ch!.message).toMatch(/already read/);
  });

  it('stays quiet when the chosen set already contains the best owned book', () => {
    const chosen = decideRead(candidates(['cult', 'dark-victory']), ctx());
    expect(challengeFor(chosen, decideRead(pool(), ctx()))).toBeNull();
  });
});
