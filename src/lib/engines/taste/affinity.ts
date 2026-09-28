// a_new = a + (1/(n+2)) * |w| * (sign(w) - a), clamped to [-1, 1]
//
// The step size shrinks as an item is seen more (n grows), so early signals
// shape the profile fast and later ones fine-tune it. Note: the magnitude of
// the signal (|w|) drives the STEP SIZE; sign(w) alone drives the DIRECTION
// (the target, +1 or -1). Using the signed w as the step multiplier as well
// as inside sign(w) double-applies the sign: for a negative w and a > -1,
// w * (sign(w) - a) is POSITIVE (two negatives), which would make a "Not for
// me" or "Dropped" signal perversely *raise* affinity — the opposite of the
// blueprint's intent ("a finished book nudges affinity toward the signal's
// direction"). |w| fixes that while preserving every property a bigger
// magnitude taking a bigger step.

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function sign(w: number): number {
  if (w > 0) return 1;
  if (w < 0) return -1;
  return 0;
}

export function updateAffinity(a: number, n: number, w: number): number {
  const next = a + (1 / (n + 2)) * Math.abs(w) * (sign(w) - a);
  return clamp(next, -1, 1);
}
