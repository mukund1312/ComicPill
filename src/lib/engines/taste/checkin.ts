import type { Dim } from '../../types/domain';
import { DIMENSIONS } from '../../types/domain';
import type { FatigueState, FinishedRead, ScorableWork, TasteProfile } from '../../types/engine-io';
import { currentStreak } from './fatigue';

export type CheckInCard =
  | { kind: 'rating' }
  | { kind: 'chips'; goodOrBetter: boolean }
  | { kind: 'calibrate'; dimension: Dim }
  | { kind: 'appetite' };

/** Card 3 calibrates the dimension the engine is least sure about, but only if
 *  this book sits near an extreme on it (below 0.25 or above 0.75) — a middling
 *  book teaches nothing. Never repeats the same dimension twice running. */
export function calibrationDimension(
  work: ScorableWork,
  profile: TasteProfile,
  lastDim: Dim | null,
): Dim | null {
  if (!work.fingerprint) return null;
  const candidates = DIMENSIONS
    .filter((d) => d !== lastDim)
    .filter((d) => {
      const v = work.fingerprint![d];
      return v <= 0.25 || v >= 0.75;
    })
    .sort((a, b) => profile.sweetSpots[a].confidence - profile.sweetSpots[b].confidence);
  return candidates[0] ?? null;
}

export function pickCheckInCards(
  work: ScorableWork,
  profile: TasteProfile,
  history: { lastCalibrationDim: Dim | null; goodOrBetter: boolean },
): CheckInCard[] {
  const cards: CheckInCard[] = [{ kind: 'rating' }, { kind: 'chips', goodOrBetter: history.goodOrBetter }];
  const dim = calibrationDimension(work, profile, history.lastCalibrationDim);
  if (dim) cards.push({ kind: 'calibrate', dimension: dim });
  cards.push({ kind: 'appetite' });
  return cards; // never more than 4
}

/**
 * Three tiers, in priority order, per the taste-engine doc's appetite table:
 *  1. Any of the four "tired of a lane" fatigue triggers -> "Something new".
 *  2. Otherwise, a streak of exactly 2 or flat back-to-back ratings -> "Mix it up".
 *     (A streak of 3+ is already caught by tier 1's own trigger, which requires
 *     "3 finished books in a row" precisely — the narrower, numbered rule wins
 *     over the doc's looser prose elsewhere that also calls a 2-streak a
 *     "fatigue trigger"; that phrase is describing this milder tier, not
 *     inventing a second definition of the 4-trigger set.)
 *  3. Otherwise -> "More like this".
 */
export function predictAppetite(
  recentFinished: FinishedRead[],
  fatigue: FatigueState,
): { preset: 'more' | 'mix' | 'new'; line: string | null } {
  if (fatigue.fatigued) {
    if (fatigue.triggers.includes('falling_ratings')) {
      return { preset: 'new', line: 'Your last two reads rated lower. Try something different?' };
    }
    if (fatigue.triggers.includes('streak')) {
      const bucket = recentFinished[0]?.bucket ?? 'that lane';
      return { preset: 'new', line: `You've read several ${bucket} books in a row.` };
    }
    return { preset: 'new', line: 'Feeling like a change tonight?' };
  }

  const { bucket, count } = currentStreak(recentFinished);
  const flatRatings = recentFinished.length >= 2 && recentFinished[0].rating === recentFinished[1].rating;
  if (count === 2 || flatRatings) {
    return { preset: 'mix', line: `You've read 2 ${bucket ?? 'similar'} books in a row.` };
  }

  return { preset: 'more', line: null };
}
