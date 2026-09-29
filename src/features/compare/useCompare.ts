import { useMemo, useState } from 'react';
import { loadAllScorableWorks } from '../../lib/db/queries/library';
import { getProfile } from '../../lib/db/queries/profile';
import { fillBasket, pickOneForMe, type Candidate } from '../../lib/engines/purchase/basket';
import { labelFor, suggestedMaxPricePaise } from '../../lib/engines/purchase/label';
import { purchaseSignals } from '../../lib/engines/purchase/signals';

export function useCompare() {
  const [budgetPaise, setBudgetPaise] = useState(250000);
  const candidates = useMemo<Candidate[]>(() => {
    const profile = getProfile(new Date());
    return [...loadAllScorableWorks().values()].filter((work) => work.pricePaise != null).slice(0, 12).map((work) => ({ id: work.id, title: work.title, pricePaise: work.pricePaise ?? 0, signals: purchaseSignals(work, { profile, isNextInReadingPath: false, pricePaise: work.pricePaise, typicalPricePaise: work.pricePaise }) }));
  }, []);
  const labelled = candidates.map((candidate) => {
    const label = labelFor(candidate.signals);
    return { ...candidate, label, waitForPricePaise: suggestedMaxPricePaise(label, candidate.pricePaise) };
  });
  const basket = fillBasket(candidates, budgetPaise); const pick = pickOneForMe(candidates);
  return { candidates: labelled, budgetPaise, setBudgetPaise, basket, pick };
}
