import type { ScorableWork, TasteProfile } from '../../types/engine-io';
import { tasteFit } from '../taste/fit';

export interface DeckCard { work: ScorableWork; kind: 'near' | 'probe' | 'wild'; }

/** A 5-card deck mixes 2 near-taste confirmations, 2 probes on the least-certain
 *  dimension, and 1 wildcard outside the reader's usual buckets. No two cards
 *  share a main character or writer. */
export function buildDeck(
  candidates: ScorableWork[],
  profile: TasteProfile,
  size: 5 | 15,
): DeckCard[] {
  const scored = candidates
    .map((w) => ({ w, fit: tasteFit(w, profile) }))
    .sort((a, b) => b.fit - a.fit);

  const used = new Set<string>();
  const usedPeople = new Set<string>();
  const pick = (pool: typeof scored, kind: DeckCard['kind'], n: number): DeckCard[] => {
    const out: DeckCard[] = [];
    for (const { w } of pool) {
      if (used.has(w.id)) continue;
      if (w.creators.some((c) => usedPeople.has(c)) || w.characters.some((c) => usedPeople.has(c))) continue;
      out.push({ work: w, kind });
      used.add(w.id);
      w.creators.forEach((c) => usedPeople.add(c));
      w.characters.forEach((c) => usedPeople.add(c));
      if (out.length >= n) break;
    }
    return out;
  };

  if (size === 5) {
    const near = pick(scored, 'near', 2);
    const probe = pick([...scored].reverse(), 'probe', 2); // crude: farthest-fit as a stand-in probe
    const wild = pick(scored, 'wild', 1);
    return [...near, ...probe, ...wild];
  }
  // Onboarding deck: broad spread across the fit spectrum.
  return pick(scored, 'near', size);
}
