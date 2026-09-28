import { filterCandidates } from './filter';
import { scoreWork } from './score';
import type { ScorableWork, TodayInput, TodayOptions, TodaySlots } from '../../types/engine-io';

interface Ranked { work: ScorableWork; total: number; parts: ReturnType<typeof scoreWork>; }

function rank(works: ScorableWork[], input: TodayInput, options: TodayOptions, slot: 'continue' | 'switch' | 'explore'): Ranked[] {
  return works
    .map((work) => {
      const parts = scoreWork(work, input, options, slot);
      return { work, total: parts.total, parts };
    })
    .sort((a, b) => b.total - a.total);
}

/** Three slots, three different buckets, always. Continue highest score in a path
 *  you're reading; Switch a different bucket at T >= floor; Explore outside your
 *  top-3 buckets at T >= floor, and the only slot carrying the novelty bonus. */
export function pickToday(input: TodayInput, options: TodayOptions): TodaySlots {
  const candidates = filterCandidates(input, options.now);
  const { config } = options;

  const inReadingPath = candidates.filter((w) => input.pathStatus[w.bucket] === 'reading');
  const continueRanked = rank(inReadingPath, input, options, 'continue');
  const continuePick = continueRanked[0] ?? null;
  const continueBucket = continuePick?.work.bucket ?? null;

  const bucketCounts = new Map<string, number>();
  for (const r of input.recentFinished) bucketCounts.set(r.bucket, (bucketCounts.get(r.bucket) ?? 0) + 1);
  const top3Buckets = new Set(
    [...bucketCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([b]) => b),
  );

  const switchCandidates = candidates.filter((w) => w.bucket !== continueBucket);
  const switchRankedAll = rank(switchCandidates, input, options, 'switch');
  const switchRanked = switchRankedAll.filter((r) => r.parts.T >= config.tasteFloorSwitch);
  const switchPick = switchRanked[0] ?? null;

  const exploreCandidates = candidates.filter(
    (w) => w.bucket !== continueBucket && w.bucket !== switchPick?.work.bucket && !top3Buckets.has(w.bucket),
  );
  const exploreRankedAll = rank(exploreCandidates, input, options, 'explore');
  const exploreRanked = exploreRankedAll.filter((r) => r.parts.T >= config.tasteFloorExplore);
  const explorePick = exploreRanked[0] ?? null;

  const lead: TodaySlots['lead'] =
    dailyExploreLead(options.dateKey) < input.profile.explorationRate && explorePick
      ? 'explore'
      : continuePick
        ? 'continue'
        : explorePick
          ? 'explore'
          : 'switch';

  return {
    continueSlot: continuePick ? { workId: continuePick.work.id, parts: continuePick.parts } : null,
    switchSlot: switchPick ? { workId: switchPick.work.id, parts: switchPick.parts } : null,
    exploreSlot: explorePick ? { workId: explorePick.work.id, parts: explorePick.parts } : null,
    lead,
    readingNow: input.recentFinished.length ? [] : [], // filled by the caller from live "reading" status, not scoring
  };
}

// A stable per-day value in [0,1) deciding whether Explore leads today.
function dailyExploreLead(dateKey: string): number {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) hash = (hash * 31 + dateKey.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 1000) / 1000;
}
