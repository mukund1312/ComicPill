// The unified WHAT/WHY/WHERE/WHEN/CAN-AFFORD/IMPACT/ACTION verdict (feature
// #36) — the capstone that ties the existing recommendation engine (WHAT/WHY),
// the price engine (WHERE), and the wallet (WHEN/CAN AFFORD/IMPACT) into one
// answer, instead of a reader having to visit three screens to get it.
import { labelFor, buyScore } from '../purchase/label';
import type { PurchaseSignals } from '../purchase/signals';
import type { BestBuy } from './price';
import type { WalletSnapshot } from './wallet';

export type FundAction = 'buy' | 'save' | 'wait' | 'skip';

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
