import { describe, expect, it } from 'vitest';
import { fundVerdict, ownedVerdict } from './verdict';
import type { PurchaseSignals } from '../purchase/signals';
import type { BestBuy } from './price';
import type { WalletSnapshot } from './wallet';

function signals(overrides: Partial<PurchaseSignals> = {}): PurchaseSignals {
  return { interest: 0.8, keeper: 0.7, urgency: 0.5, priceValue: 0.7, ...overrides };
}
function best(totalPaise: number, retailerId = 'r1'): BestBuy {
  return { retailerId, totalPaise, pricePaise: totalPaise, shippingPaise: 0, savingsVsHighestPaise: 0 };
}
function wallet(overrides: Partial<WalletSnapshot> = {}): WalletSnapshot {
  return { monthlyBudgetPaise: 500000, availablePaise: 300000, reservedPaise: 0, spentThisCyclePaise: 0, budgetRemainingPaise: 300000, ...overrides };
}

describe('fundVerdict', () => {
  it('action: skip when the purchase label itself is skip, regardless of price', () => {
    const v = fundVerdict('w1', signals({ interest: 0.1 }), best(50000), wallet(), null);
    expect(v.action).toBe('skip');
  });

  it('action: buy when price fits both available and remaining budget', () => {
    const v = fundVerdict('w1', signals(), best(200000), wallet({ availablePaise: 300000, budgetRemainingPaise: 300000 }), null);
    expect(v.action).toBe('buy');
    expect(v.canAffordNow).toBe(true);
    expect(v.impactPaise).toBe(100000);
  });

  it('action: buy is refused when it fits available but not the monthly budget', () => {
    const v = fundVerdict('w1', signals(), best(200000), wallet({ availablePaise: 300000, budgetRemainingPaise: 50000 }), null);
    expect(v.canAffordNow).toBe(false);
    expect(v.action).not.toBe('buy');
  });

  it('action: save with a day estimate when a daily saving rate is given and it can’t be afforded now', () => {
    const v = fundVerdict('w1', signals(), best(500000), wallet({ availablePaise: 100000, budgetRemainingPaise: 100000 }), 10000);
    expect(v.action).toBe('save');
    expect(v.actionDetail).toMatch(/days/);
  });

  it('wait when there is no price on file yet', () => {
    const v = fundVerdict('w1', signals(), null, wallet(), null);
    expect(v.action).toBe('wait');
    expect(v.wherePaise).toBeNull();
  });
});

describe('ownedVerdict', () => {
  // Regression test for a real bug: getFundVerdict (wallet.ts) never checked
  // ownership at all, so a comic already owned physically still showed
  // "Best Buy in Print" with retailer prices. The query layer now
  // short-circuits to this verdict before fundVerdict ever runs.
  it('given a physical-owned comic, suppresses the buy CTA', () => {
    const v = ownedVerdict('w1', 'physical');
    expect(v.action).toBe('owned');
    expect(v.wherePaise).toBeNull();
    expect(v.whereRetailerId).toBeNull();
  });

  it('names the owned format in the reason', () => {
    expect(ownedVerdict('w1', 'digital').why).toMatch(/digital/);
    expect(ownedVerdict('w1', 'physical').why).toMatch(/physical/);
  });
});
