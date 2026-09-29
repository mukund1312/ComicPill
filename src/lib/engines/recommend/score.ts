import { tasteFit } from '../taste/fit';
import { fatiguePenalty, currentStreak } from '../taste/fatigue';
import { noveltyBonus, distanceFromRecentAverage } from './novelty';
import { isAccessible } from '../../util/own';
import type { Genre } from '../../types/domain';
import type {
  EngineConfig, ScorableWork, ScoreParts, TodayInput, TodayOptions,
} from '../../types/engine-io';

// Mood pills (from the blueprint's Today screen: Dark, Mysterious, Epic,
// Character-driven, Fun, Emotional, Surprise Me) are a reader-facing
// vocabulary, not the same thing as the Genre enum — matching a mood pill id
// directly against work.genres was always an approximation, and became a
// type error once Genre stopped being a bare string. This mapping is the
// real fix: each mood pulls in the genres that actually express it.
export const MOOD_GENRES: Record<string, Genre[]> = {
  dark: ['horror', 'crime', 'dystopia', 'reality_warping'],
  mysterious: ['mystery', 'detective', 'supernatural'],
  epic: ['cosmic', 'war', 'mythic', 'multiverse', 'gods', 'apocalypse'],
  'character-driven': ['drama', 'political'],
  fun: ['comedy', 'satire', 'heroic'],
  emotional: ['drama', 'war'],
};

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
    const moodGenres = MOOD_GENRES[options.mood] ?? [];
    const matches = work.genres.some((g) => moodGenres.includes(g)) || work.bucket === options.mood;
    M = matches ? 1 : 0.3;
  } else {
    // No mood picked: M's weight folds into T instead of scoring 0.
    M = 0;
  }

  const pathState = input.pathStatus[work.bucket] ?? 'not_in_path';
  const isNextInBucket = input.nextWorkIdByBucket[work.bucket] === work.id;
  const P = isNextInBucket && pathState === 'reading' ? 1
    : isNextInBucket && pathState === 'unstarted' ? 0.5
    : 0;
  // 'wishlist'/'ordered' aren't in hand yet — same as not owned for scoring;
  // 'subscription' is readable now even though nothing sits on the shelf.
  const O = isAccessible(work.own) ? 1 : 0.3;

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
