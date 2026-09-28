import { tasteFit } from '../taste/fit';
import { fatiguePenalty, currentStreak } from '../taste/fatigue';
import { noveltyBonus, distanceFromRecentAverage } from './novelty';
import type {
  EngineConfig, ScorableWork, ScoreParts, TodayInput, TodayOptions,
} from '../../types/engine-io';

/** A deterministic 0..1 pseudo-random value from a string seed — the "tie-breaker
 *  seeded by today's date" that keeps Today stable within an evening but fresh
 *  day to day. Not cryptographic; just needs to be stable and cheap. */
export function dailyJitter(workId: string, dateKey: string): number {
  const s = `${workId}|${dateKey}`;
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  // map to [0, 0.01) — small enough to only break ties, never move a ranking.
  return (Math.abs(hash) % 1000) / 100000;
}

export function scoreWork(
  work: ScorableWork,
  input: TodayInput,
  options: TodayOptions,
  slot: 'continue' | 'switch' | 'explore',
): ScoreParts {
  const { config } = options;
  let T = tasteFit(work, input.profile);
  let M: number;

  if (options.mood) {
    M = work.genres.includes(options.mood) || work.bucket === options.mood ? 1 : 0.3;
  } else {
    // No mood picked: M's weight folds into T instead of scoring 0.
    M = 0;
  }

  const pathState = input.pathStatus[work.bucket] ?? 'not_in_path';
  const isNextInBucket = input.nextWorkIdByBucket[work.bucket] === work.id;
  const P = isNextInBucket && pathState === 'reading' ? 1
    : isNextInBucket && pathState === 'unstarted' ? 0.5
    : 0;
  const O = work.own === 'none' ? 0.3 : 1;

  const last3 = input.recentFinished.slice(0, 3);
  const { count: streak } = currentStreak(input.recentFinished);
  const F = fatiguePenalty(work, last3, streak);

  let N = 0;
  if (slot === 'explore') {
    const last5 = input.recentFinished.slice(0, 5);
    const d = distanceFromRecentAverage(work, last5);
    N = noveltyBonus(d, input.profile.adventurousness);
  }

  const weights = options.mood
    ? config.weights
    : { ...config.weights, T: config.weights.T + config.weights.M, M: 0 };

  const total =
    weights.T * T + weights.M * M + config.weights.P * P + config.weights.O * O +
    N - config.weights.F * F + dailyJitter(work.id, options.dateKey);

  const contributions: ScoreParts['contributions'] = [
    { part: 'T', value: weights.T * T, detail: `Fits your taste` },
    { part: 'P', value: config.weights.P * P, detail: P === 1 ? `Next in a path you're reading` : P === 0.5 ? `Next in a path you haven't started` : `Not next up in its path` },
    { part: 'O', value: config.weights.O * O, detail: O === 1 ? `You own it` : `Not owned yet` },
  ];
  if (options.mood) contributions.push({ part: 'M', value: weights.M * M, detail: `Matches tonight's mood` });
  if (N > 0) contributions.push({ part: 'N', value: N, detail: `Something a little different` });

  return { T, M, P, O, N, F, total, contributions };
}
