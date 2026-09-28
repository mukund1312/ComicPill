import { describe, expect, it } from 'vitest';
import { labelFor, buyScore } from '../purchase/label';
import { fillBasket, pickOneForMe, type Candidate } from '../purchase/basket';
import type { PurchaseSignals } from '../purchase/signals';

const sig = (p: Partial<PurchaseSignals>): PurchaseSignals => ({
  interest: 0.5, keeper: 0.5, urgency: 0.5, priceValue: 0.5, ...p,
});

describe('labelFor — every threshold boundary', () => {
  it('interest below 0.4 is always skip', () => {
    expect(labelFor(sig({ interest: 0.399 }))).toBe('skip');
    expect(labelFor(sig({ interest: 0 }))).toBe('skip');
  });
  it('interest in (0.4, 0.6] is try_digital_first, regardless of keeper', () => {
    expect(labelFor(sig({ interest: 0.4, keeper: 0.9 }))).toBe('try_digital_first');
    expect(labelFor(sig({ interest: 0.6, keeper: 0.9 }))).toBe('try_digital_first');
  });
  it('interest above 0.6 with keeper >= 0.5 is collect, unless price value is low', () => {
    expect(labelFor(sig({ interest: 0.601, keeper: 0.5, priceValue: 0.9 }))).toBe('collect');
    expect(labelFor(sig({ interest: 0.601, keeper: 0.499, priceValue: 0.9 }))).toBe('digital_is_fine');
  });
  it('a good fit with poor price value becomes buy_on_sale, not collect', () => {
    expect(labelFor(sig({ interest: 0.8, keeper: 0.8, priceValue: 0.1 }))).toBe('buy_on_sale');
  });
});

describe('fillBasket', () => {
  const candidates: Candidate[] = [
    { id: 'a', title: 'A', pricePaise: 60000, signals: sig({ interest: 0.9, keeper: 0.9, priceValue: 0.8 }) }, // collect
    { id: 'b', title: 'B', pricePaise: 40000, signals: sig({ interest: 0.85, keeper: 0.9, priceValue: 0.2 }) }, // buy_on_sale
    { id: 'c', title: 'C', pricePaise: 30000, signals: sig({ interest: 0.9, keeper: 0.95, priceValue: 0.9 }) }, // collect
    { id: 'd', title: 'D', pricePaise: 99999999, signals: sig({ interest: 0.95, keeper: 0.95, priceValue: 0.9 }) }, // too expensive
  ];

  it('never exceeds the budget', () => {
    for (const budgetRupees of [1500, 2500, 5000]) {
      const basket = fillBasket(candidates, budgetRupees * 100);
      expect(basket.totalPaise).toBeLessThanOrEqual(budgetRupees * 100);
    }
  });

  it('fills collect tier before buy_on_sale', () => {
    const basket = fillBasket(candidates, 100000 * 100); // generous budget
    const labels = basket.buy.map((b) => b.label);
    const firstSaleIdx = labels.indexOf('buy_on_sale');
    const lastCollectIdx = labels.lastIndexOf('collect');
    if (firstSaleIdx !== -1 && lastCollectIdx !== -1) {
      expect(lastCollectIdx).toBeLessThan(firstSaleIdx);
    }
  });

  it('never includes a skip-labelled candidate', () => {
    const skippy: Candidate = { id: 'e', title: 'E', pricePaise: 100, signals: sig({ interest: 0.1 }) };
    const basket = fillBasket([...candidates, skippy], 100000 * 100);
    expect(basket.buy.some((b) => b.candidate.id === 'e')).toBe(false);
  });
});

describe('pickOneForMe', () => {
  it('never returns a skip-labelled candidate', () => {
    const onlySkip: Candidate[] = [{ id: 'x', title: 'X', pricePaise: 100, signals: sig({ interest: 0.1 }) }];
    expect(pickOneForMe(onlySkip)).toBeNull();
  });

  it('the cheaper of two equally-scored candidates wins', () => {
    const tie: Candidate[] = [
      { id: 'cheap', title: 'Cheap', pricePaise: 10000, signals: sig({ interest: 0.9, keeper: 0.9, priceValue: 0.9 }) },
      { id: 'pricey', title: 'Pricey', pricePaise: 90000, signals: sig({ interest: 0.9, keeper: 0.9, priceValue: 0.9 }) },
    ];
    expect(pickOneForMe(tie)?.id).toBe('cheap');
  });

  it('a higher buy score wins even at a higher price', () => {
    const candidates: Candidate[] = [
      { id: 'better', title: 'Better', pricePaise: 90000, signals: sig({ interest: 0.95, keeper: 0.95, priceValue: 0.9 }) },
      { id: 'worse', title: 'Worse', pricePaise: 10000, signals: sig({ interest: 0.61, keeper: 0.51, priceValue: 0.2 }) },
    ];
    expect(buyScore(candidates[0].signals)).toBeGreaterThan(buyScore(candidates[1].signals));
    expect(pickOneForMe(candidates)?.id).toBe('better');
  });
});
