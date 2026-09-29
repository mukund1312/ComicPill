// The unified WHAT/WHY/WHERE/WHEN/CAN-AFFORD/IMPACT/ACTION verdict (feature
// #36) — the capstone that ties the existing recommendation engine (WHAT/WHY),
// the price engine (WHERE), and the wallet (WHEN/CAN AFFORD/IMPACT) into one
// answer, instead of a reader having to visit three screens to get it.
import { labelFor, buyScore } from '../purchase/label';
import type { PurchaseSignals } from '../purchase/signals';
import type { BestBuy } from './price';
import type { WalletSnapshot } from './wallet';

export type FundAction = 'buy' | 'save' | 'wait' | 'skip' | 'owned';

/** Purchase signals/scoring never see ownership — they answer "is this worth
 *  owning", not "does the reader already own it". This is the short-circuit
 *  the query layer must apply before computing a real buy/save/wait verdict:
 *  a representative edition already in hand must never surface as a "Best
 *  Buy in Print" candidate for the exact copy already on the shelf. */
export function ownedVerdict(workId: string, format: 'physical' | 'digital'): FundVerdict {
  return {
    workId, why: `Already in your collection (${format}).`, wherePaise: null, whereRetailerId: null,
    canAffordNow: false, impactPaise: null, action: 'owned', actionDetail: 'No purchase needed.',
  };
}

export interface FundVerdict {
  workId: string;
  why: string;
  wherePaise: number | null; // best landed price, if any price data exists
  whereRetailerId: string | null;
  canAffordNow: boolean;
  impactPaise: number | null; // budget remaining AFTER this purchase, if bought now
  action: FundAction;
  actionDetail: string; // e.g. "This month" | "₹50/day ≈ 140 days" | null-safe string always
}

export function fundVerdict(
  workId: string,
  signals: PurchaseSignals,
  best: BestBuy | null,
  wallet: WalletSnapshot,
  suggestedDailySavingPaise: number | null,
): FundVerdict {
  const label = labelFor(signals);
  const score = buyScore(signals);

  if (label === 'skip') {
    return {
      workId, why: 'Not a strong match for your taste right now.', wherePaise: best?.totalPaise ?? null,
      whereRetailerId: best?.retailerId ?? null, canAffordNow: false, impactPaise: null,
      action: 'skip', actionDetail: 'Not recommended right now.',
    };
  }

  const price = best?.totalPaise ?? null;
  const canAffordNow = price != null && price <= wallet.availablePaise && price <= wallet.budgetRemainingPaise;
  const why = signals.keeper >= 0.5
    ? 'A strong next physical addition, worth owning.'
    : 'Fits your taste, but read digitally before committing shelf space.';

  if (price == null) {
    return {
      workId, why, wherePaise: null, whereRetailerId: null, canAffordNow: false, impactPaise: null,
      action: 'wait', actionDetail: 'No price on file yet.',
    };
  }

  if (canAffordNow) {
    return {
      workId, why, wherePaise: price, whereRetailerId: best!.retailerId, canAffordNow: true,
      impactPaise: wallet.budgetRemainingPaise - price, action: 'buy', actionDetail: 'This month',
    };
  }

  if (suggestedDailySavingPaise && suggestedDailySavingPaise > 0) {
    const daysNeeded = Math.ceil((price - Math.max(0, wallet.availablePaise)) / suggestedDailySavingPaise);
    return {
      workId, why, wherePaise: price, whereRetailerId: best!.retailerId, canAffordNow: false,
      impactPaise: null, action: 'save',
      actionDetail: `₹${Math.round(suggestedDailySavingPaise / 100)}/day ≈ ${daysNeeded} days`,
    };
  }

  return {
    workId, why, wherePaise: price, whereRetailerId: best!.retailerId, canAffordNow: false,
    impactPaise: null, action: score >= 0.5 ? 'save' : 'wait',
    actionDetail: 'Not within this month’s budget.',
  };
}
