// The Comic Wallet's four distinct numbers (feature #1 — never collapse
// these into one balance): available (spendable now), reserved (committed
// to Piggy Banks), spent this cycle, and monthly budget remaining. V1 is a
// virtual ledger only — see the plan's "Comic Wallet..." section — so this
// never touches real money, only user-declared ledger rows.
import type { WalletConfig, WalletLedgerEntry, PiggyBank } from '../../types/domain';

export interface WalletSnapshot {
  monthlyBudgetPaise: number;
  availablePaise: number;
  reservedPaise: number;
  spentThisCyclePaise: number;
  budgetRemainingPaise: number; // can go negative — that's the honest "over budget" state, never clamped
}

/** The most recent cycle boundary on/before `now`, given a reset day. Cycle
 *  boundaries fall on `resetDay` of each month; a `resetDay` past the end of
 *  a short month (e.g. 30 in February) clamps to that month's last day. */
export function cycleStart(now: Date, resetDay: number): Date {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const clampedDay = (y: number, m: number) => Math.min(resetDay, daysInMonth(y, m));
  if (day >= clampedDay(year, month)) return new Date(Date.UTC(year, month, clampedDay(year, month)));
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  return new Date(Date.UTC(prevYear, prevMonth, clampedDay(prevYear, prevMonth)));
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function computeWalletSnapshot(
  config: WalletConfig,
  ledger: WalletLedgerEntry[],
  piggyBanks: PiggyBank[],
  now: Date,
): WalletSnapshot {
  const cycleStartIso = cycleStart(now, config.budgetResetDay).toISOString();
  const thisCycle = ledger.filter((e) => e.occurredAt >= cycleStartIso);

  const sumOf = (entries: WalletLedgerEntry[], type: WalletLedgerEntry['type']) =>
    entries.filter((e) => e.type === type).reduce((s, e) => s + e.amountPaise, 0);

  const totalIn = sumOf(ledger, 'top_up') + sumOf(ledger, 'piggy_refund');
  const totalOut = sumOf(ledger, 'purchase') + sumOf(ledger, 'piggy_contribution');
  const availablePaise = totalIn - totalOut;

  const reservedPaise = piggyBanks
    .filter((p) => p.status === 'saving' || p.status === 'ready')
    .reduce((s, p) => s + p.savedPaise, 0);

  const spentThisCyclePaise = sumOf(thisCycle, 'purchase');
  const contributedThisCyclePaise = sumOf(thisCycle, 'piggy_contribution');

  const budgetRemainingPaise = config.monthlyBudgetPaise
    - spentThisCyclePaise
    - (config.savingsCountsTowardBudget ? contributedThisCyclePaise : 0);

  return { monthlyBudgetPaise: config.monthlyBudgetPaise, availablePaise, reservedPaise, spentThisCyclePaise, budgetRemainingPaise };
}
