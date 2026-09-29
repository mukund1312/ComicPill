// Regression test for a real bug: Today's mood pills passed their
// capitalized display label straight through as the mood id ('Dark'), but
// MOOD_GENRES keys are lowercase ('dark'), so every mood pill silently
// scored the same "no match" 0.3 regardless of which one was selected —
// mood selection had no visible effect on the recommendation. Fixed in
// TodayScreen.tsx by giving each pill a lowercase `id` distinct from its
// `label`; this test pins the scoring half of that contract so it can't
// regress silently again.
import { describe, expect, it } from 'vitest';
import { scoreWork } from './score';
import { emptyProfile } from '../taste/profile';
import { DEFAULT_ENGINE_CONFIG } from '../../types/engine-io';
import type { Dim } from '../../types/domain';
import type { ScorableWork, TodayInput, TodayOptions } from '../../types/engine-io';

const DIMENSIONS: Dim[] = ['tone', 'violence', 'scale', 'complexity', 'mystery', 'pace', 'artForward', 'commitment'];

function work(id: string, genres: ScorableWork['genres']): ScorableWork {
  const fingerprint = {} as Record<Dim, number>;
  DIMENSIONS.forEach((d) => { fingerprint[d] = 0.5; });
  return {
    id, title: id, bucket: 'batman', universe: 'main', fingerprint, genres,
    creators: [], characters: [], contextNeeded: 'none', requiredParentIds: [],
    own: 'physical', keeper: false, pricePaise: null, formatVerdict: 'physical',
  };
}

function input(works: ScorableWork[]): TodayInput {
  return {
    works, edges: [], profile: emptyProfile(),
    pathStatus: { batman: 'not_in_path' }, nextWorkIdByBucket: { batman: null },
    ownedOnly: false, formatFilter: 'any', recentFinished: [], recentNotTonight: [], excludedWorkIds: new Set(),
  };
}

describe('scoreWork mood matching', () => {
  const now = new Date('2026-09-30T20:00:00Z');

  it('ranks a genre-matching work above a non-matching one when a mood id is selected', () => {
    // Black Mirror = crime (matches MOOD_GENRES.dark); Kingdom Come = mythic (does not).
    const blackMirror = work('black-mirror', ['crime']);
    const kingdomCome = work('kingdom-come', ['mythic']);
    const options: TodayOptions = { mood: 'dark', dateKey: '2026-09-30', config: DEFAULT_ENGINE_CONFIG, now };
    const inp = input([blackMirror, kingdomCome]);

    const a = scoreWork(blackMirror, inp, options, 'switch');
    const b = scoreWork(kingdomCome, inp, options, 'switch');

    expect(a.M).toBe(1);
    expect(b.M).toBe(0.3);
    expect(a.total).toBeGreaterThan(b.total);
  });

  it('a capitalized label (the old, buggy id) never matches any mood genre', () => {
    const blackMirror = work('black-mirror', ['crime']);
    const options: TodayOptions = { mood: 'Dark', dateKey: '2026-09-30', config: DEFAULT_ENGINE_CONFIG, now };
    const inp = input([blackMirror]);

    const scored = scoreWork(blackMirror, inp, options, 'switch');
    // This is the bug, pinned: with the wrong-case id, M falls back to 0.3
    // even for a work that should match. If this ever starts passing with
    // M === 1, the id casing has silently started matching by accident.
    expect(scored.M).toBe(0.3);
  });
});
