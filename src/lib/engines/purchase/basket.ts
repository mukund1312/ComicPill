import { buyScore, labelFor, type PurchaseLabel } from './label';
import type { PurchaseSignals } from './signals';

export interface Candidate {
  id: string;
  title: string;
  pricePaise: number;
  signals: PurchaseSignals;
}
export interface BasketItem { candidate: Candidate; label: PurchaseLabel; score: number; }
export interface Basket { buy: BasketItem[]; totalPaise: number; }

/** Greedy by buy-score-per-rupee, Collect tier first then Buy on sale, then one
 *  swap attempt to use leftover budget better. */
export function fillBasket(candidates: Candidate[], budgetPaise: number): Basket {
  const scored = candidates
    .map((c) => ({ candidate: c, label: labelFor(c.signals), score: buyScore(c.signals) }))
    .filter((c): c is BasketItem => c.label === 'collect' || c.label === 'buy_on_sale');

  const byTier = (label: PurchaseLabel) =>
    scored.filter((c) => c.label === label).sort((a, b) => (b.score / b.candidate.pricePaise) - (a.score / a.candidate.pricePaise));

  const ordered = [...byTier('collect'), ...byTier('buy_on_sale')];

  const buy: BasketItem[] = [];
  let spent = 0;
  for (const item of ordered) {
    if (spent + item.candidate.pricePaise <= budgetPaise) {
      buy.push(item);
      spent += item.candidate.pricePaise;
    }
  }

  // One swap attempt: try replacing the single cheapest kept item with the best
  // unkept item that (a) fits the remaining budget and (b) raises total score.
  const leftover = budgetPaise - spent;
  const notBought = ordered.filter((c) => !buy.includes(c));
  const cheapestBought = [...buy].sort((a, b) => a.candidate.pricePaise - b.candidate.pricePaise)[0];
  for (const candidate of notBought) {
    const extraNeeded = candidate.candidate.pricePaise - (cheapestBought?.candidate.pricePaise ?? 0);
    if (extraNeeded <= leftover && candidate.score > (cheapestBought?.score ?? 0)) {
      if (cheapestBought) {
        const idx = buy.indexOf(cheapestBought);
        buy[idx] = candidate;
        spent += extraNeeded;
      } else if (candidate.candidate.pricePaise <= leftover) {
        buy.push(candidate);
        spent += candidate.candidate.pricePaise;
      }
      break;
    }
  }

  return { buy, totalPaise: spent };
}

/** Highest buy score among non-skip candidates; the cheaper one wins ties. */
export function pickOneForMe(candidates: Candidate[]): Candidate | null {
  const eligible = candidates
    .map((c) => ({ candidate: c, label: labelFor(c.signals), score: buyScore(c.signals) }))
    .filter((c) => c.label !== 'skip')
    .sort((a, b) => b.score - a.score || a.candidate.pricePaise - b.candidate.pricePaise);
  return eligible[0]?.candidate ?? null;
}
