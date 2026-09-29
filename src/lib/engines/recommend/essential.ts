// "What comics absolutely need to be in my physical collection?" — a
// collection-building generator, distinct from Today (tonight's read) and
// Compare (a specific purchase decision). Answers job #9 from the product
// requirements: a constrained, ranked "must-own" list, not a taste-fit score.
import { tasteFit } from '../taste/fit';
import type { ScorableWork, TasteProfile } from '../../types/engine-io';
import { isAccessible } from '../../util/own';

export interface EssentialCollectionConstraints {
  publishers?: string[]; // e.g. ['DC', 'Marvel'] — omit for "any publisher"
  excludeOwned?: boolean; // default true — the natural reading of "what am I missing"
  physicalOnly?: boolean; // filters to works whose keeper flag / format verdict favors print
  count: number;
}

export interface EssentialPick {
  work: ScorableWork;
  score: number; // keeper-worthiness + personal taste fit, blended
  reason: string;
}

/** Ranks by a blend of (a) the work's own keeper-worthiness — is this
 *  broadly considered essential, independent of any one reader's taste —
 *  and (b) this reader's own taste fit, so the list isn't just "canon" but
 *  "canon that's actually for you". Pure ranking; publisher/format/exclude
 *  filters are applied first. */
export function essentialCollection(
  candidates: ScorableWork[],
  profile: TasteProfile,
  publisherByWorkId: Map<string, string | null>,
  constraints: EssentialCollectionConstraints,
): EssentialPick[] {
  const excludeOwned = constraints.excludeOwned ?? true;

  const filtered = candidates.filter((w) => {
    if (excludeOwned && isAccessible(w.own)) return false;
    if (constraints.physicalOnly && w.formatVerdict !== 'physical' && !w.keeper) return false;
    if (constraints.publishers?.length) {
      const publisher = publisherByWorkId.get(w.id);
      if (!publisher || !constraints.publishers.includes(publisher)) return false;
    }
    return true;
  });

  const ranked = filtered
    .map((work) => {
      const fit = tasteFit(work, profile);
      // Keeper-worthiness matters even before we know much about personal
      // taste (a cold-start reader should still see canon, not just noise);
      // as taste data accumulates, fit pulls the ranking toward "for you".
      const keeperScore = work.keeper ? 0.7 : 0.3;
      const score = 0.5 * keeperScore + 0.5 * fit;
      const reason = work.keeper
        ? `A landmark, widely considered essential${fit > 0.6 ? ' — and it fits what you already love' : ''}.`
        : `Fits your taste closely, even if it's not a universally "must-own" title.`;
      return { work, score, reason };
    })
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, constraints.count);
}
