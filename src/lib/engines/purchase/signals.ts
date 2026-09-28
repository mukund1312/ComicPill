import { tasteFit } from '../taste/fit';
import type { ScorableWork, TasteProfile } from '../../types/engine-io';

export interface PurchaseSignals { interest: number; keeper: number; urgency: number; priceValue: number; }
export interface PurchaseContext {
  profile: TasteProfile;
  isNextInReadingPath: boolean;
  pricePaise: number | null;
  typicalPricePaise: number | null;
}

export function purchaseSignals(work: ScorableWork, ctx: PurchaseContext): PurchaseSignals {
  const interest = tasteFit(work, ctx.profile);
  const keeper = work.keeper
    ? Math.max(0.5, work.fingerprint?.artForward ?? 0.5)
    : (work.fingerprint?.artForward ?? 0.3) * 0.6;
  const urgency = ctx.isNextInReadingPath ? 1 : 0.3;

  let priceValue = 0.5;
  if (ctx.pricePaise != null && ctx.typicalPricePaise) {
    const ratio = ctx.pricePaise / ctx.typicalPricePaise;
    priceValue = ratio <= 0.7 ? 1 : ratio <= 1 ? 0.7 : ratio <= 1.3 ? 0.4 : 0.15;
  }

  return { interest, keeper, urgency, priceValue };
}
