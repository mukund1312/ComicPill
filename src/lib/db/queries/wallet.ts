// Comic Wallet + Piggy Bank + Smart Purchase System — the query/assembly
// layer. V1 is a virtual ledger only (see the plan's "Comic Wallet..."
// section): every write here is a user-declared amount, never a real charge.
import { and, eq } from 'drizzle-orm';
import { db } from '../client';
import {
  walletConfig, walletLedger, piggyBanks, savingRules, retailers, comicPrices,
  priceAlerts, cartItems, editions,
} from '../schema';
import { loadAllScorableWorks, loadAllWorkContexts } from './library';
import { getProfile } from './profile';
import { pickRepresentativeEdition } from '../map';
import { computeWalletSnapshot, type WalletSnapshot } from '../../engines/fund/wallet';
import { piggyBankReadiness, settlePiggyBank, type PiggyBankReadiness } from '../../engines/fund/piggybank';
import { bestBuy, type BestBuy } from '../../engines/fund/price';
import { optimizeCart, type CartCandidate, type CartOptimizerResult } from '../../engines/fund/cart';
import { fundVerdict, type FundVerdict } from '../../engines/fund/verdict';
import { purchaseSignals } from '../../engines/purchase/signals';
import { newId } from '../../util/id';
import type { WalletConfig, PiggyBank, PiggyBankStatus, WalletLedgerEntry } from '../../types/domain';

const ROW_ID = 1;

// ---------------------------------------------------------------------------
// Wallet config + ledger
// ---------------------------------------------------------------------------
export function getWalletConfig(): WalletConfig {
  const row = db.select().from(walletConfig).where(eq(walletConfig.id, ROW_ID)).get();
  if (row) return { monthlyBudgetPaise: row.monthlyBudgetPaise, budgetResetDay: row.budgetResetDay, rolloverEnabled: row.rolloverEnabled, savingsCountsTowardBudget: row.savingsCountsTowardBudget };
  const fallback: WalletConfig = { monthlyBudgetPaise: 0, budgetResetDay: 1, rolloverEnabled: false, savingsCountsTowardBudget: true };
  db.insert(walletConfig).values({ id: ROW_ID, ...fallback }).run();
  return fallback;
}

export function setWalletConfig(config: Partial<WalletConfig>): void {
  const existing = db.select().from(walletConfig).where(eq(walletConfig.id, ROW_ID)).get();
  if (existing) db.update(walletConfig).set(config).where(eq(walletConfig.id, ROW_ID)).run();
  else db.insert(walletConfig).values({ id: ROW_ID, monthlyBudgetPaise: 0, budgetResetDay: 1, rolloverEnabled: false, savingsCountsTowardBudget: true, ...config }).run();
}

function appendLedger(type: 'top_up' | 'purchase' | 'piggy_contribution' | 'piggy_refund', amountPaise: number, opts: { piggyBankId?: string; workId?: string; note?: string } = {}): void {
  db.insert(walletLedger).values({
    id: newId(), type, amountPaise, piggyBankId: opts.piggyBankId ?? null, workId: opts.workId ?? null,
    note: opts.note ?? null, occurredAt: new Date().toISOString(),
  }).run();
}

/** Feature #20 — a manual top-up. The "this takes you ₹X above budget"
 *  confirmation copy is a UI concern; this just records the declared amount. */
export function addFunds(amountPaise: number, note?: string): void {
  appendLedger('top_up', amountPaise, { note });
}

export function getActivePiggyBanks(): PiggyBank[] {
  return db.select().from(piggyBanks).all()
    .filter((p) => p.status === 'saving' || p.status === 'ready')
    .map((p) => ({ ...p, status: p.status as PiggyBankStatus }));
}

export function getWalletSnapshot(now: Date): WalletSnapshot {
  const config = getWalletConfig();
  const ledger = db.select().from(walletLedger).all() as WalletLedgerEntry[];
  const banks = getActivePiggyBanks();
  return computeWalletSnapshot(config, ledger, banks, now);
}

export function listLedger() {
  return db.select().from(walletLedger).all().sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
}

// ---------------------------------------------------------------------------
// Piggy Banks
// ---------------------------------------------------------------------------
export function listPiggyBanks(): PiggyBank[] {
  return db.select().from(piggyBanks).all()
    .map((p) => ({ ...p, status: p.status as PiggyBankStatus }))
    .sort((a, b) => a.priority - b.priority);
}

export function createPiggyBank(workId: string, editionId: string | null, name: string, targetPaise: number): PiggyBank {
  const record = { id: newId(), workId, editionId, name, targetPaise, savedPaise: 0, status: 'saving' as PiggyBankStatus, priority: 0, createdAt: new Date().toISOString() };
  db.insert(piggyBanks).values(record).run();
  return record;
}

/** Manual "+ Add savings" (features #5/#30) — records both the piggy bank's
 *  running total AND a ledger entry, so the two never drift apart. */
export function contributeToPiggyBank(piggyBankId: string, amountPaise: number): void {
  const bank = db.select().from(piggyBanks).where(eq(piggyBanks.id, piggyBankId)).get();
  if (!bank) return;
  db.update(piggyBanks).set({ savedPaise: bank.savedPaise + amountPaise }).where(eq(piggyBanks.id, piggyBankId)).run();
  appendLedger('piggy_contribution', amountPaise, { piggyBankId, workId: bank.workId });
}

/** Feature #8 — auto-allocate a lump sum across goals; callers get the
 *  engine's distribution and pass it here to actually apply it. */
export function applyAllocation(allocations: Array<{ piggyBankId: string; amountPaise: number }>): void {
  for (const a of allocations) contributeToPiggyBank(a.piggyBankId, a.amountPaise);
}

/** Feature #24 — settle a Piggy Bank against the real purchase price: marks
 *  it purchased, records the spend, and returns the leftover for the caller
 *  to route (return to wallet vs move to another goal). */
export function settlePiggyBankPurchase(piggyBankId: string, actualPricePaise: number): { leftoverPaise: number } {
  const bank = db.select().from(piggyBanks).where(eq(piggyBanks.id, piggyBankId)).get();
  if (!bank) return { leftoverPaise: 0 };
  const { spentPaise, leftoverPaise } = settlePiggyBank({ ...bank, status: bank.status as PiggyBankStatus }, actualPricePaise);
  db.update(piggyBanks).set({ status: 'purchased', savedPaise: 0 }).where(eq(piggyBanks.id, piggyBankId)).run();
  appendLedger('purchase', spentPaise, { piggyBankId, workId: bank.workId, note: bank.name });
  return { leftoverPaise };
}

export function returnLeftoverToWallet(piggyBankId: string, leftoverPaise: number): void {
  if (leftoverPaise <= 0) return;
  const bank = db.select().from(piggyBanks).where(eq(piggyBanks.id, piggyBankId)).get();
  appendLedger('piggy_refund', leftoverPaise, { piggyBankId, workId: bank?.workId, note: 'Leftover after purchase' });
}

export function moveLeftoverToPiggyBank(fromPiggyBankId: string, toPiggyBankId: string, leftoverPaise: number): void {
  if (leftoverPaise <= 0) return;
  contributeToPiggyBank(toPiggyBankId, leftoverPaise);
}

export function cancelPiggyBank(piggyBankId: string): void {
  const bank = db.select().from(piggyBanks).where(eq(piggyBanks.id, piggyBankId)).get();
  if (!bank || bank.savedPaise <= 0) {
    if (bank) db.update(piggyBanks).set({ status: 'cancelled' }).where(eq(piggyBanks.id, piggyBankId)).run();
    return;
  }
  appendLedger('piggy_refund', bank.savedPaise, { piggyBankId, workId: bank.workId, note: 'Piggy Bank cancelled' });
  db.update(piggyBanks).set({ status: 'cancelled', savedPaise: 0 }).where(eq(piggyBanks.id, piggyBankId)).run();
}

/** Features #21-23 — re-checks readiness against the current best price,
 *  never assuming "target reached" means "ready to buy". */
export function checkPiggyBankReadiness(piggyBankId: string): PiggyBankReadiness | null {
  const bank = db.select().from(piggyBanks).where(eq(piggyBanks.id, piggyBankId)).get();
  if (!bank || !bank.editionId) return null;
  const prices = db.select().from(comicPrices).where(eq(comicPrices.editionId, bank.editionId)).all();
  const best = bestBuy(prices);
  if (!best) return null;
  return piggyBankReadiness({ ...bank, status: bank.status as PiggyBankStatus }, best.totalPaise);
}

// ---------------------------------------------------------------------------
// Price discovery
// ---------------------------------------------------------------------------
export function getBestBuyForEdition(editionId: string): BestBuy | null {
  const prices = db.select().from(comicPrices).where(eq(comicPrices.editionId, editionId)).all();
  // Only the latest quote per retailer — comparing stale duplicates would
  // double-count a retailer that's just been re-scraped.
  const latestByRetailer = new Map<string, (typeof prices)[number]>();
  for (const p of prices) {
    const existing = latestByRetailer.get(p.retailerId);
    if (!existing || p.capturedAt > existing.capturedAt) latestByRetailer.set(p.retailerId, p);
  }
  return bestBuy([...latestByRetailer.values()]);
}

/** Seeds a handful of representative multi-retailer quotes from an edition's
 *  existing typicalPricePaise, since there's no real price-feed access in
 *  this environment (same constraint as the catalog build) — clearly
 *  placeholder data, not live prices. Swapping in a real feed later doesn't
 *  change any engine signature. No-op if this edition already has quotes. */
export function seedPricesForEdition(editionId: string): void {
  const existing = db.select().from(comicPrices).where(eq(comicPrices.editionId, editionId)).limit(1).all();
  if (existing.length > 0) return;
  const edition = db.select().from(editions).where(eq(editions.id, editionId)).get();
  const base = edition?.typicalPricePaise;
  if (!base) return;

  const RETAILER_SEED = [
    { id: 'retailer-amazon', name: 'Amazon', factor: 0.96, shipping: 0 },
    { id: 'retailer-flipkart', name: 'Flipkart', factor: 1.04, shipping: 0 },
    { id: 'retailer-local-a', name: 'Comic Retailer A', factor: 0.93, shipping: 4900 },
    { id: 'retailer-local-b', name: 'Comic Retailer B', factor: 1.0, shipping: 0 },
  ];
  const now = new Date().toISOString();
  for (const r of RETAILER_SEED) {
    const retailerExists = db.select().from(retailers).where(eq(retailers.id, r.id)).get();
    if (!retailerExists) db.insert(retailers).values({ id: r.id, name: r.name }).run();
    db.insert(comicPrices).values({
      id: newId(), editionId, retailerId: r.id, pricePaise: Math.round(base * r.factor), shippingPaise: r.shipping,
      url: null, capturedAt: now,
    }).run();
  }
}

export function listRetailers() {
  return db.select().from(retailers).all();
}

export function createPriceAlert(workId: string, editionId: string, targetPricePaise: number) {
  const record = { id: newId(), workId, editionId, targetPricePaise, active: true };
  db.insert(priceAlerts).values(record).run();
  return record;
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------
export function listCartItems() {
  return db.select().from(cartItems).all();
}

export function addToCart(workId: string, editionId: string): void {
  const existing = db.select().from(cartItems).where(and(eq(cartItems.workId, workId), eq(cartItems.editionId, editionId))).get();
  if (existing) return;
  db.insert(cartItems).values({ id: newId(), workId, editionId, addedAt: new Date().toISOString() }).run();
}

export function removeFromCart(cartItemId: string): void {
  db.delete(cartItems).where(eq(cartItems.id, cartItemId)).run();
}

/** Assembles the Cart Optimizer's inputs from the cart, catalog, and taste
 *  profile, then runs it. Items with no edition price on file fall back to
 *  the edition's typicalPricePaise (or are skipped if neither exists). */
export function runCartOptimizer(now: Date): CartOptimizerResult {
  const items = listCartItems();
  const worksById = loadAllScorableWorks();
  const contexts = loadAllWorkContexts();
  const contextByWork = new Map(contexts.map((c) => [c.work.id, c]));
  const profile = getProfile(now);
  const snapshot = getWalletSnapshot(now);

  const candidates: CartCandidate[] = [];
  for (const item of items) {
    const work = worksById.get(item.workId);
    const ctx = contextByWork.get(item.workId);
    if (!work || !ctx) continue;
    const best = getBestBuyForEdition(item.editionId);
    const edition = ctx.editions.find((e) => e.id === item.editionId);
    const pricePaise = best?.totalPaise ?? edition?.typicalPricePaise ?? null;
    if (pricePaise == null) continue;
    const signals = purchaseSignals(work, { profile, isNextInReadingPath: false, pricePaise, typicalPricePaise: edition?.typicalPricePaise ?? pricePaise });
    const unreadPhysicalBacklogCount = contexts.filter((c) => c.library?.status !== 'done' && c.library?.status !== 'dropped' && (c.library?.own === 'physical' || c.library?.own === 'both')).length;
    candidates.push({ id: item.id, title: work.title, pricePaise, signals, hasDigitalAccess: work.own === 'digital' || work.own === 'both' || work.own === 'subscription', unreadPhysicalBacklogCount });
  }

  return optimizeCart(candidates, Math.max(0, snapshot.budgetRemainingPaise));
}

// ---------------------------------------------------------------------------
// The unified verdict (feature #36)
// ---------------------------------------------------------------------------
export function getFundVerdict(workId: string, now: Date): FundVerdict | null {
  const worksById = loadAllScorableWorks();
  const work = worksById.get(workId);
  const contexts = loadAllWorkContexts();
  const ctx = contexts.find((c) => c.work.id === workId);
  if (!work || !ctx) return null;

  const edition = pickRepresentativeEdition(ctx);
  const profile = getProfile(now);
  const snapshot = getWalletSnapshot(now);
  const best = edition ? getBestBuyForEdition(edition.id) : null;
  const pricePaise = best?.totalPaise ?? edition?.typicalPricePaise ?? null;
  const signals = purchaseSignals(work, { profile, isNextInReadingPath: false, pricePaise, typicalPricePaise: edition?.typicalPricePaise ?? null });

  const linkedBank = db.select().from(piggyBanks).where(and(eq(piggyBanks.workId, workId), eq(piggyBanks.status, 'saving'))).get();
  const rule = linkedBank ? db.select().from(savingRules).where(eq(savingRules.piggyBankId, linkedBank.id)).get() : null;
  const dailyRate = rule
    ? (rule.frequency === 'daily' ? rule.amountPaise
      : rule.frequency === 'weekly' ? rule.amountPaise / 7
      : rule.frequency === 'monthly' ? rule.amountPaise / 30
      : rule.frequency === 'custom' && rule.customEveryDays ? rule.amountPaise / rule.customEveryDays
      : null)
    : null;

  return fundVerdict(workId, signals, best, snapshot, dailyRate);
}
