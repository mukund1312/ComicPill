// Price discovery: Best Buy, price history verdicts, and target-price alerts
// (features #10-13). Always operates on prices already matched to one exact
// edition_id — comparing across editions (Compact vs Deluxe) is exactly the
// mistake this system must never make, so callers are responsible for
// pre-filtering to a single edition before calling these.
import type { ComicPrice, PriceAlert } from '../../types/domain';

export interface BestBuy {
  retailerId: string;
  totalPaise: number; // price + shipping — the number that actually matters
  pricePaise: number;
  shippingPaise: number;
  savingsVsHighestPaise: number;
}

/** Ranks by total landed cost (price + shipping), not sticker price alone —
 *  a cheaper listing with expensive shipping can lose to a pricier one that
 *  ships free (feature #10's explicit requirement). Assumes `prices` is
 *  already the latest quote per retailer for one edition. */
export function bestBuy(prices: ComicPrice[]): BestBuy | null {
  if (prices.length === 0) return null;
  const withTotal = prices.map((p) => ({ ...p, total: p.pricePaise + p.shippingPaise }));
  const cheapest = withTotal.reduce((a, b) => (b.total < a.total ? b : a));
  const highest = withTotal.reduce((a, b) => (b.total > a.total ? b : a));
  return {
    retailerId: cheapest.retailerId,
    totalPaise: cheapest.total,
    pricePaise: cheapest.pricePaise,
    shippingPaise: cheapest.shippingPaise,
    savingsVsHighestPaise: highest.total - cheapest.total,
  };
}

export interface PriceHistory {
  currentPaise: number;
  typicalPaise: number;
  lowestSeenPaise: number;
  verdict: 'good_price_buy' | 'wait' | 'neutral';
}

/** `prices` should be one retailer/edition's quotes over time, oldest first
 *  or in any order — sorted internally by capturedAt. "Good price" means at
 *  or below typical; "wait" means notably above the lowest ever seen
 *  (feature #12's "frequently drops below ₹X" framing). */
export function priceHistory(prices: ComicPrice[]): PriceHistory | null {
  if (prices.length === 0) return null;
  const sorted = [...prices].sort((a, b) => (a.capturedAt < b.capturedAt ? -1 : 1));
  const currentPaise = sorted[sorted.length - 1].pricePaise;
  const typicalPaise = Math.round(sorted.reduce((s, p) => s + p.pricePaise, 0) / sorted.length);
  const lowestSeenPaise = Math.min(...sorted.map((p) => p.pricePaise));
  const verdict: PriceHistory['verdict'] =
    currentPaise <= typicalPaise ? 'good_price_buy'
    : currentPaise > lowestSeenPaise * 1.15 ? 'wait'
    : 'neutral';
  return { currentPaise, typicalPaise, lowestSeenPaise, verdict };
}

/** Alerts whose target has been met by the current best price for that
 *  edition (feature #13). `currentBestPriceByEdition` should be built from
 *  bestBuy() results, one per edition. */
export function checkPriceAlerts(
  alerts: PriceAlert[],
  currentBestPriceByEdition: Map<string, number>,
): PriceAlert[] {
  return alerts.filter((a) => {
    if (!a.active) return false;
    const current = currentBestPriceByEdition.get(a.editionId);
    return current != null && current <= a.targetPricePaise;
  });
}
