// N = 0.3 * d * (0.5 + adventurousness)
// d is how far the candidate sits from the average of the last 5 reads, 0..1.
export function noveltyBonus(d: number, adventurousness: number): number {
  return 0.3 * d * (0.5 + adventurousness);
}

export function distanceFromRecentAverage(
  work: { fingerprint: Record<string, number> | null },
  last5: Array<{ fingerprint: Record<string, number> | null }>,
): number {
  const withPrints = last5.filter((r) => r.fingerprint);
  if (!work.fingerprint || !withPrints.length) return 0.5; // unknown -> neutral

  const dims = Object.keys(work.fingerprint);
  const avg: Record<string, number> = {};
  for (const dim of dims) {
    avg[dim] = withPrints.reduce((s, r) => s + (r.fingerprint![dim] ?? 0.5), 0) / withPrints.length;
  }
  let sum = 0;
  for (const dim of dims) sum += Math.abs(work.fingerprint[dim] - avg[dim]);
  return Math.min(1, sum / dims.length);
}
