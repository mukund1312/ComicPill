import { describe, expect, it } from 'vitest';
import { cartOverflow, optimizeCart, type CartCandidate } from './cart';
import type { PurchaseSignals } from '../purchase/signals';

function signals(overrides: Partial<PurchaseSignals> = {}): PurchaseSignals {
  return { interest: 0.8, keeper: 0.7, urgency: 0.5, priceValue: 0.7, ...overrides };
}
function item(id: string, pricePaise: number, overrides: Partial<CartCandidate> = {}): CartCandidate {
  return { id, title: id, pricePaise, signals: signals(), hasDigitalAccess: false, unreadPhysicalBacklogCount: 0, ...overrides };
}

describe('cartOverflow', () => {
  it('returns the overage amount when the cart exceeds available budget', () => {
    expect(cartOverflow(489600, 300000)).toBe(189600);
  });
  it('returns null when the cart fits', () => {
    expect(cartOverflow(200000, 300000)).toBeNull();
  });
});

describe('optimizeCart', () => {
  it('buys what fits the budget and marks the rest wait, each with a reason', () => {
    const items = [item('a', 99900), item('b', 109900)];
    const result = optimizeCart(items, 150000);
    const a = result.decisions.find((d) => d.candidate.id === 'a')!;
    expect(a.action).toBe('buy_now');
    expect(a.reason.length).toBeGreaterThan(0);
    const b = result.decisions.find((d) => d.candidate.id === 'b')!;
    expect(b.action).toBe('wait');
    expect(b.reason.length).toBeGreaterThan(0);
  });

  it('postpones an item the reader already has digital access to, over waiting', () => {
    const items = [item('a', 149900, { hasDigitalAccess: true })];
    const result = optimizeCart(items, 0);
    expect(result.decisions[0].action).toBe('postpone');
    expect(result.decisions[0].reason).toMatch(/digital/);
  });

  it('recommends buying nothing when the budget is zero and backlog is heavy', () => {
    const items = [item('a', 99900, { unreadPhysicalBacklogCount: 8 })];
    const result = optimizeCart(items, 0);
    expect(result.buyNothing).toBe(true);
    expect(result.buyNothingReason).toMatch(/unread/);
  });

  it('is never buyNothing when at least one item is bought', () => {
    const items = [item('a', 50000)];
    const result = optimizeCart(items, 100000);
    expect(result.buyNothing).toBe(false);
    expect(result.buyNothingReason).toBeNull();
  });
});
