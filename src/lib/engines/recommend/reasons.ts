import type { ScoreParts } from '../../types/engine-io';

/** The top 3 positive contributions become the reasons, verbatim — so a reason
 *  that isn't backed by a score part cannot exist. Never a percentage. */
export function reasonsFor(parts: ScoreParts): string[] {
  return parts.contributions
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((c) => c.detail);
}
