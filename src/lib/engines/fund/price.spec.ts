import { describe, expect, it } from 'vitest';
import { bestBuy, priceHistory, checkPriceAlerts } from './price';
import type { ComicPrice, PriceAlert } from '../../types/domain';

function price(retailerId: string, pricePaise: number, shippingPaise = 0, capturedAt = '2026-01-01'): ComicPrice {
  return { id: `${retailerId}-${capturedAt}`, editionId: 'ed1', retailerId, pricePaise, shippingPaise, url: null, capturedAt };
}

describe('bestBuy', () => {
  it('ranks by landed cost (price + shipping), not sticker price alone', () => {
    const prices = [price('cheap-sticker-expensive-ship', 449900, 60000), price('free-ship', 489900, 0)];
    const best = bestBuy(prices);
    expect(best?.retailerId).toBe('free-ship'); // 509900 total vs 489900 — free-ship actually wins
  });
  it('reports real savings vs the highest current listing', () => {
    const prices = [price('a', 465000), price('b', 519900), price('c', 499900)];
    const best = bestBuy(prices);
    expect(best?.retailerId).toBe('a');
    expect(best?.savingsVsHighestPaise).toBe(519900 - 465000);
  });
  it('returns null for no listings', () => {
    expect(bestBuy([])).toBeNull();
  });
});

describe('priceHistory', () => {
  it('good_price_buy when current is at or below typical', () => {
    const h = priceHistory([price('r', 150000, 0, '2026-01-01'), price('r', 145000, 0, '2026-02-01'), price('r', 140000, 0, '2026-03-01')]);
    expect(h?.currentPaise).toBe(140000);
    expect(h?.verdict).toBe('good_price_buy');
  });
  it('wait when current is well above the lowest ever seen', () => {
    const h = priceHistory([price('r', 99900, 0, '2026-01-01'), price('r', 129900, 0, '2026-02-01')]);
    expect(h?.lowestSeenPaise).toBe(99900);
    expect(h?.verdict).toBe('wait');
  });
  it('returns null for no data', () => {
    expect(priceHistory([])).toBeNull();
  });
});

describe('checkPriceAlerts', () => {
  it('triggers only alerts whose target has been met and are active', () => {
    const alerts: PriceAlert[] = [
      { id: '1', workId: 'w1', editionId: 'e1', targetPricePaise: 100000, active: true },
      { id: '2', workId: 'w2', editionId: 'e2', targetPricePaise: 100000, active: true },
      { id: '3', workId: 'w3', editionId: 'e3', targetPricePaise: 100000, active: false },
    ];
    const current = new Map([['e1', 94900], ['e2', 150000], ['e3', 50000]]);
    const triggered = checkPriceAlerts(alerts, current);
    expect(triggered.map((a) => a.id)).toEqual(['1']);
  });
});
