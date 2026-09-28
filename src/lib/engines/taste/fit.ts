import type { Dim } from '../../types/domain';
import { DIMENSIONS } from '../../types/domain';
import type { ScorableWork, SweetSpots, TasteProfile } from '../../types/engine-io';

/** Weighted distance between a fingerprint and the sweet spots, 0 (far) .. 1 (identical). */
export function fingerprintCloseness(
  fingerprint: Record<Dim, number>,
  sweetSpots: SweetSpots,
): number {
  // A dimension with real confidence contributes its actual distance-based
  // closeness. An uncalibrated dimension contributes a FIXED neutral 0.5 —
  // never a distance to the arbitrary un-set 0.5 default — because that
  // default isn't a real preference, and scoring distance-to-it would quietly
  // reward any candidate whose *unrelated* sliders happen to sit near 0.5,
  // which has nothing to do with the reader's taste. A small baseline weight
  // on the neutral term keeps a single calibrated dimension from swinging the
  // whole score by coincidence, without letting blandness masquerade as fit.
  const BASELINE_WEIGHT = 0.05;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const dim of DIMENSIONS) {
    const spot = sweetSpots[dim];
    if (spot.confidence > 0) {
      const distance = Math.abs(fingerprint[dim] - spot.value); // 0..1
      weightedSum += (1 - distance) * spot.confidence;
      weightTotal += spot.confidence;
    }
    weightedSum += 0.5 * BASELINE_WEIGHT;
    weightTotal += BASELINE_WEIGHT;
  }
  return weightedSum / weightTotal;
}

function avgAffinity(values: Array<{ score: number; seen: number } | undefined>): number | null {
  const seen = values.filter((v): v is { score: number; seen: number } => !!v && v.seen > 0);
  if (!seen.length) return null;
  // score is -1..1; map to 0..1 to combine with closeness.
  const mean = seen.reduce((s, v) => s + v.score, 0) / seen.length;
  return (mean + 1) / 2;
}

/** T: taste fit, 0..1. Closeness of the 8 sliders to sweet spots, averaged with tag/creator/character affinity. */
export function tasteFit(work: ScorableWork, profile: TasteProfile): number {
  const closeness = work.fingerprint
    ? fingerprintCloseness(work.fingerprint, profile.sweetSpots)
    : 0.5; // unfingerprinted work: neutral, never blocks scoring

  const tagAffinities = [
    ...work.genres.map((g) => profile.affinities.genre[g]),
    ...work.creators.map((c) => profile.affinities.creator[c]),
    ...work.characters.map((c) => profile.affinities.character[c]),
    profile.affinities.bucket[work.bucket],
  ];
  const affinityScore = avgAffinity(tagAffinities);

  if (affinityScore === null) return closeness;
  return (closeness + affinityScore) / 2;
}
