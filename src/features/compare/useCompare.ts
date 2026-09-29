import { useMemo, useState } from 'react';
import { loadAllScorableWorks, loadAllWorkContexts } from '../../lib/db/queries/library';
import { getProfile } from '../../lib/db/queries/profile';
import { fillBasket, pickOneForMe, type Candidate } from '../../lib/engines/purchase/basket';
import { labelFor, suggestedMaxPricePaise } from '../../lib/engines/purchase/label';
import { purchaseSignals } from '../../lib/engines/purchase/signals';

export type FormatPrice = { format: 'physical' | 'digital'; pricePaise: number };
export type CompareCandidate = Candidate & { formatPrices: FormatPrice[] };

export function useCompare() {
  const [budgetPaise, setBudgetPaise] = useState(250000);
  const candidates = useMemo<CompareCandidate[]>(() => {
    const profile = getProfile(new Date());
    const formatPricesByWorkId = new Map(loadAllWorkContexts().map((context) => {
      const byFormat = new Map<'physical' | 'digital', number>();
      for (const edition of context.editions) {
        if (edition.typicalPricePaise == null) continue;
        const format = edition.format as 'physical' | 'digital';
        const current = byFormat.get(format);
        if (current == null || edition.typicalPricePaise < current) byFormat.set(format, edition.typicalPricePaise);
      }
      return [context.work.id, [...byFormat.entries()].map(([format, pricePaise]) => ({ format, pricePaise }))];
    }));
    return [...loadAllScorableWorks().values()].map((work) => {
      const formatPrices = formatPricesByWorkId.get(work.id) ?? [];
      // Preserve the representative price used by the existing purchase
      // engine; formatPrices is presentation data for an honest UI, not a
      // reason to silently change recommendation scoring.
      const pricePaise = work.pricePaise ?? Math.min(...formatPrices.map((edition) => edition.pricePaise));
      return { id: work.id, title: work.title, pricePaise, formatPrices, signals: purchaseSignals(work, { profile, isNextInReadingPath: false, pricePaise, typicalPricePaise: pricePaise }) };
    }).filter((work) => Number.isFinite(work.pricePaise)).slice(0, 12);
  }, []);
  const labelled = candidates.map((candidate) => {
    const label = labelFor(candidate.signals);
    return { ...candidate, label, waitForPricePaise: suggestedMaxPricePaise(label, candidate.pricePaise) };
  });
  const basket = fillBasket(candidates, budgetPaise); const pick = pickOneForMe(candidates);
  return { candidates: labelled, budgetPaise, setBudgetPaise, basket, pick };
}
