// Enforces the plan's performance budget: pickToday() over 500 works must
// stay comfortably under 8ms, since it's the thing that runs every time
// Today opens (or a mood pill is tapped) with zero network involved. This is
// what "fast, quick, crisp" cashes out to as an actual, checked number.
import { describe, expect, it } from 'vitest';
import { pickToday } from '../recommend/slots';
import { emptyProfile } from '../taste/profile';
import { DEFAULT_ENGINE_CONFIG } from '../../types/engine-io';
import type { Dim } from '../../types/domain';
import type { ScorableWork, TodayInput } from '../../types/engine-io';

const DIMENSIONS: Dim[] = ['tone', 'violence', 'scale', 'complexity', 'mystery', 'pace', 'artForward', 'commitment'];
const BUCKETS = ['batman', 'street', 'heroic', 'dark', 'dccosmic', 'marvelcosmic', 'elseworld', 'other'];

// Deterministic pseudo-random so the benchmark is reproducible run to run.
function prand(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function buildWorks(count: number): ScorableWork[] {
  const works: ScorableWork[] = [];
  for (let i = 0; i < count; i++) {
    const fingerprint = {} as Record<Dim, number>;
    DIMENSIONS.forEach((d, j) => { fingerprint[d] = prand(i * 31 + j); });
    works.push({
      id: `work-${i}`,
      title: `Work ${i}`,
      bucket: BUCKETS[i % BUCKETS.length],
      universe: 'main',
      fingerprint,
      genres: [`genre-${i % 12}`],
      creators: [`creator-${i % 20}`],
      characters: [`character-${i % 30}`],
      contextNeeded: 'none',
      requiredParentIds: [],
      own: i % 3 === 0 ? 'physical' : i % 3 === 1 ? 'digital' : 'none',
      keeper: i % 5 === 0,
      pricePaise: null,
      formatVerdict: i % 2 === 0 ? 'physical' : 'digital',
    });
  }
  return works;
}

function buildInput(works: ScorableWork[]): TodayInput {
  const pathStatus: TodayInput['pathStatus'] = {};
  const nextWorkIdByBucket: TodayInput['nextWorkIdByBucket'] = {};
  BUCKETS.forEach((b, i) => {
    pathStatus[b] = i === 0 ? 'reading' : 'unstarted';
    const firstInBucket = works.find((w) => w.bucket === b);
    nextWorkIdByBucket[b] = firstInBucket?.id ?? null;
  });
  return {
    works, edges: [], profile: emptyProfile(), pathStatus, nextWorkIdByBucket,
    ownedOnly: false, recentFinished: [], recentNotTonight: [], excludedWorkIds: new Set(),
  };
}

describe('performance budget', () => {
  it('pickToday over 500 works stays under 8ms on average', () => {
    const works = buildWorks(500);
    const input = buildInput(works);
    const now = new Date('2026-09-28T20:00:00Z');
    const options = { mood: null, dateKey: '2026-09-28', config: DEFAULT_ENGINE_CONFIG, now };

    // Warm up (JIT), then measure.
    for (let i = 0; i < 5; i++) pickToday(input, options);

    const runs = 50;
    const start = performance.now();
    for (let i = 0; i < runs; i++) pickToday(input, options);
    const elapsed = performance.now() - start;
    const avgMs = elapsed / runs;

    // eslint-disable-next-line no-console
    console.log(`pickToday: ${avgMs.toFixed(3)}ms avg over ${runs} runs, 500 works`);
    expect(avgMs).toBeLessThan(8);
  });

  it('scales roughly linearly, not quadratically, with catalog size', () => {
    const now = new Date('2026-09-28T20:00:00Z');
    const options = { mood: null, dateKey: '2026-09-28', config: DEFAULT_ENGINE_CONFIG, now };

    const time = (n: number) => {
      const input = buildInput(buildWorks(n));
      for (let i = 0; i < 3; i++) pickToday(input, options); // warm up
      const start = performance.now();
      for (let i = 0; i < 20; i++) pickToday(input, options);
      return (performance.now() - start) / 20;
    };

    const t100 = time(100);
    const t1000 = time(1000);
    // A 10x catalog should cost well under a 10x hit if this is O(n) or O(n log n);
    // a real O(n^2) regression would blow way past this.
    expect(t1000).toBeLessThan(t100 * 15 + 5); // +5ms floor guards against noise at tiny t100
  });
});
