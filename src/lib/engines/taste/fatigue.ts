import type { Dim } from '../../types/domain';
import { DIMENSIONS } from '../../types/domain';
import type { FatigueState, FinishedRead, NotTonight, ScorableWork } from '../../types/engine-io';

const DAY_MS = 24 * 60 * 60 * 1000;

/** How similar two fingerprints are, 0 (different) .. 1 (identical). */
function fingerprintSimilarity(a: Record<Dim, number>, b: Record<Dim, number>): number {
  let sum = 0;
  for (const dim of DIMENSIONS) sum += 1 - Math.abs(a[dim] - b[dim]);
  return sum / DIMENSIONS.length;
}

/** Similarity between a candidate and the last 3 finished books: same bucket, same
 *  main character, or close slider values all count. */
function similarityToRecent(work: ScorableWork, last3: FinishedRead[]): number {
  if (!last3.length) return 0;
  const scores = last3.map((r) => {
    let s = 0;
    if (r.bucket === work.bucket) s += 0.5;
    if (work.fingerprint && r.fingerprint) {
      s += 0.5 * fingerprintSimilarity(work.fingerprint, r.fingerprint);
    }
    return Math.min(1, s);
  });
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/** F: fatigue penalty. Similarity to the last 3 finished books, scaled by streak
 *  strength (1 book in a row counts a third, 3+ counts fully). */
export function fatiguePenalty(work: ScorableWork, last3: FinishedRead[], streak: number): number {
  const similarity = similarityToRecent(work, last3);
  const streakFactor = streak >= 3 ? 1 : streak === 2 ? 2 / 3 : streak === 1 ? 1 / 3 : 0;
  return similarity * streakFactor;
}

/** How many consecutive most-recent finishes share a bucket. */
export function currentStreak(recentFinished: FinishedRead[]): { bucket: string | null; count: number } {
  if (!recentFinished.length) return { bucket: null, count: 0 };
  const bucket = recentFinished[0].bucket;
  let count = 0;
  for (const r of recentFinished) {
    if (r.bucket !== bucket) break;
    count += 1;
  }
  return { bucket, count };
}

export function detectFatigue(
  recentFinished: FinishedRead[],
  recentNotTonight: NotTonight[],
  now: Date,
): FatigueState {
  const triggers: FatigueState['triggers'] = [];
  const { count } = currentStreak(recentFinished);
  if (count >= 3) triggers.push('streak');

  if (recentFinished.length >= 2) {
    const avg = recentFinished.reduce((s, r) => s + r.rating, 0) / recentFinished.length;
    const lastTwo = recentFinished.slice(0, 2);
    if (lastTwo.every((r) => r.rating < avg)) triggers.push('falling_ratings');
  }

  const sevenDaysAgo = now.getTime() - 7 * DAY_MS;
  const byBucket = new Map<string, number>();
  for (const nt of recentNotTonight) {
    if (new Date(nt.at).getTime() < sevenDaysAgo) continue;
    byBucket.set(nt.bucket, (byBucket.get(nt.bucket) ?? 0) + 1);
  }
  if ([...byBucket.values()].some((n) => n >= 2)) triggers.push('repeated_not_tonight');

  if (recentFinished.length > 0) {
    const daysSinceLast = (now.getTime() - new Date(recentFinished[0].finishedAt).getTime()) / DAY_MS;
    if (daysSinceLast >= 14) triggers.push('long_gap');
  }

  return { fatigued: triggers.length > 0, triggers };
}
