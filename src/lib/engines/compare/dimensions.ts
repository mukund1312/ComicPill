// Shared scoring helpers for Compare. The old ten-score ranking that lived
// here was replaced by the decision pipeline in ./decide; these three small
// pure functions are what that pipeline still builds on.
import type { Dim } from '../../types/domain';
import type { TasteProfile } from '../../types/engine-io';

// Excellent/Strong/Moderate/Weak — no fake precision like "93.72". These
// thresholds mirror the qualitative bands used elsewhere in the app.
export function qualityLabel(score: number): 'Excellent' | 'Strong' | 'Moderate' | 'Weak' {
  if (score >= 0.8) return 'Excellent';
  if (score >= 0.6) return 'Strong';
  if (score >= 0.4) return 'Moderate';
  return 'Weak';
}

/** Same weighted closeness-to-sweet-spot math as fingerprintCloseness, but
 *  scoped to a subset of dimensions — lets "story fit" and "artwork" be
 *  genuinely different numbers instead of both just being the same overall
 *  taste fit restated twice. */
export function closenessOn(fingerprint: Record<Dim, number>, profile: TasteProfile, dims: Dim[]): number {
  const BASELINE_WEIGHT = 0.05;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const dim of dims) {
    const spot = profile.sweetSpots[dim];
    if (spot.confidence > 0) {
      const distance = Math.abs(fingerprint[dim] - spot.value);
      weightedSum += (1 - distance) * spot.confidence;
      weightTotal += spot.confidence;
    }
    weightedSum += 0.5 * BASELINE_WEIGHT;
    weightTotal += BASELINE_WEIGHT;
  }
  return weightedSum / weightTotal;
}

export function avgAffinity(values: ({ score: number; seen: number } | undefined)[]): number | null {
  const seen = values.filter((v): v is { score: number; seen: number } => !!v && v.seen > 0);
  if (!seen.length) return null;
  const mean = seen.reduce((s, v) => s + v.score, 0) / seen.length;
  return (mean + 1) / 2; // -1..1 -> 0..1
}
