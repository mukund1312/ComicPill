// Smart Cart: budget overflow framing and the Cart Optimizer (features
// #14-19). Reuses the existing purchase engine (buyScore/labelFor) rather
// than re-deriving purchase-worthiness — the Optimizer's job is deciding
// WHICH of the worthwhile candidates fit this month's budget and WHY, not
// re-scoring whether they're worth buying at all.
import { buyScore, labelFor } from '../purchase/label';
import { fillBasket, type Candidate } from '../purchase/basket';

export interface CartCandidate extends Candidate {
  hasDigitalAccess: boolean; // already accessible digitally — a real "read it first" option
  unreadPhysicalBacklogCount: number; // how many unread physical books this reader already owns
}

export interface CartDecision {
  candidate: CartCandidate;
  action: 'buy_now' | 'postpone' | 'wait';
  reason: string;
}

export interface CartOptimizerResult {
  decisions: CartDecision[];
  totalBuyNowPaise: number;
  buyNothing: boolean;
  buyNothingReason: string | null;
}

/** "You're ₹X over your comic budget" — never "insufficient balance"
 *  (feature #15). Returns null when the cart already fits. */
export function cartOverflow(cartTotalPaise: number, availableBudgetPaise: number): number | null {
  const over = cartTotalPaise - availableBudgetPaise;
  return over > 0 ? over : null;
}

/** Splits the cart into buy_now (fits the budget, worth it now),
 *  postpone (a digital alternative already covers the reader today — no
 *  urgency to buy physical this month), and wait (worth physical eventually,
 *  just didn't make the cut this budget cycle) — each with a one-line
 *  reason (feature #18), and can legitimately recommend buying nothing
 *  (feature #19) when the backlog itself is the better answer. */
export function optimizeCart(items: CartCandidate[], budgetPaise: number): CartOptimizerResult {
  const basket = fillBasket(items, budgetPaise);
  const boughtIds = new Set(basket.buy.map((b) => b.candidate.id));

  const decisions: CartDecision[] = items.map((item) => {
    if (boughtIds.has(item.id)) {
      return { candidate: item, action: 'buy_now', reason: 'Fits this month’s budget and is worth owning now.' };
    }
    if (item.hasDigitalAccess) {
      return { candidate: item, action: 'postpone', reason: 'You already have digital access.' };
    }
    if (item.unreadPhysicalBacklogCount >= 5) {
      return { candidate: item, action: 'wait', reason: `You already have ${item.unreadPhysicalBacklogCount} unread physical books.` };
    }
    return { candidate: item, action: 'wait', reason: 'Strong match for your taste, but it didn’t fit this month’s budget.' };
  });

  const buyNothing = basket.buy.length === 0 && items.length > 0;
  const buyNothingReason = buyNothing
    ? (items.every((i) => i.unreadPhysicalBacklogCount >= 5)
        ? `You already have unread physical books waiting — read from your shelf before buying more.`
        : `Nothing in your cart is priced well enough right now to justify this month’s budget.`)
    : null;

  return { decisions, totalBuyNowPaise: basket.totalPaise, buyNothing, buyNothingReason };
}

/** Exposed for callers that want the raw priority score without running the
 *  full optimizer (e.g. sorting a wishlist by purchase urgency). */
export function cartPriority(candidate: Candidate): number {
  return labelFor(candidate.signals) === 'skip' ? -1 : buyScore(candidate.signals);
}
