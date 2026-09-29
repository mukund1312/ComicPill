import type { PurchaseSignals } from './signals';

export type PurchaseLabel = 'collect' | 'buy_on_sale' | 'digital_is_fine' | 'try_digital_first' | 'skip';

/** interest < 0.4 -> skip; 0.4-0.6 -> try_digital_first; > 0.6 with keeper >= 0.5
 *  -> collect (buy_on_sale if price value is low), else digital_is_fine. */
export function labelFor(s: PurchaseSignals): PurchaseLabel {
  if (s.interest < 0.4) return 'skip';
  if (s.interest <= 0.6) return 'try_digital_first';
  if (s.keeper >= 0.5) return s.priceValue < 0.4 ? 'buy_on_sale' : 'collect';
  return 'digital_is_fine';
}

export function buyScore(s: PurchaseSignals): number {
  return 0.4 * s.interest + 0.3 * s.keeper + 0.2 * s.urgency + 0.1 * s.priceValue;
}

/** Job #29: "should I wait for a discount?" A 'buy_on_sale' verdict on its
 *  own doesn't tell the reader what price makes it worth buying — this does.
 *  Derived directly from the priceValue thresholds in purchaseSignals(): a
 *  price at or below 1.3x the typical price is where the verdict would flip
 *  from buy_on_sale to collect. Only meaningful for that label; returns null
 *  otherwise (there's no "wait for a discount" on a skip or a digital-fine). */
export function suggestedMaxPricePaise(label: PurchaseLabel, typicalPricePaise: number | null): number | null {
  if (label !== 'buy_on_sale' || typicalPricePaise == null) return null;
  return Math.floor(typicalPricePaise * 1.3);
}
