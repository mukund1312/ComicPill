// Piggy Bank math: schedules, projections, the priority warning, and
// auto-allocation of a lump sum across active goals (features #4-9).
import type { PiggyBank, SavingRule, SavingFrequency } from '../../types/domain';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Converts any schedule into a per-day rate, so different frequencies can
 *  be compared and summed on one axis (feature #7's "≈ ₹X/day" total). */
export function dailyEquivalent(rule: SavingRule): number {
  switch (rule.frequency as SavingFrequency) {
    case 'daily': return rule.amountPaise;
    case 'weekly': return rule.amountPaise / 7;
    case 'monthly': return rule.amountPaise / 30;
    case 'custom': return rule.customEveryDays ? rule.amountPaise / rule.customEveryDays : 0;
    case 'manual': return 0;
  }
}

/** "You'll reach your goal around DATE" (feature #4). Null for a manual-only
 *  schedule or a schedule too slow/empty to ever finish. */
export function projectCompletionDate(bank: PiggyBank, rule: SavingRule, now: Date): Date | null {
  const remaining = bank.targetPaise - bank.savedPaise;
  if (remaining <= 0) return now;
  const perDay = dailyEquivalent(rule);
  if (perDay <= 0) return null;
  const daysNeeded = Math.ceil(remaining / perDay);
  return new Date(now.getTime() + daysNeeded * MS_PER_DAY);
}

export interface SavingsPlanSummary {
  totalDailyPaise: number;
  totalMonthlyPaise: number; // totalDailyPaise * 30, the display-friendly figure
  percentOfBudget: number | null; // null when there's no budget set to compare against
  warning: string | null; // informational only, never blocking (feature #7)
}

export function savingsPlanSummary(
  banksWithRules: Array<{ bank: PiggyBank; rule: SavingRule }>,
  monthlyBudgetPaise: number,
): SavingsPlanSummary {
  const active = banksWithRules.filter(({ bank }) => bank.status === 'saving');
  const totalDailyPaise = active.reduce((s, { rule }) => s + dailyEquivalent(rule), 0);
  const totalMonthlyPaise = totalDailyPaise * 30;
  const percentOfBudget = monthlyBudgetPaise > 0 ? totalMonthlyPaise / monthlyBudgetPaise : null;
  const warning = percentOfBudget != null && percentOfBudget >= 0.6
    ? `Your current savings schedule would allocate approximately ${Math.round(percentOfBudget * 100)}% of your comic budget to Piggy Banks.`
    : null;
  return { totalDailyPaise, totalMonthlyPaise, percentOfBudget, warning };
}

export interface AllocationResult { piggyBankId: string; amountPaise: number; }

/** Distributes a lump sum across active goals (feature #8), proportional to
 *  remaining need, weighted by priority (lower `priority` number = more
 *  weight) — never over-fills a goal past its target. Runs a second pass to
 *  redistribute any leftover from capped goals to goals that still have
 *  room, so the full lump sum is placed whenever total remaining need
 *  allows it. */
export function autoAllocate(lumpSumPaise: number, banks: PiggyBank[]): AllocationResult[] {
  let pool = Array.from(
    banks.filter((b) => b.status === 'saving' && b.savedPaise < b.targetPaise),
    (b) => ({ id: b.id, remaining: b.targetPaise - b.savedPaise, weight: 1 / (b.priority + 1) }),
  );
  const allocated = new Map<string, number>();
  let remainingSum = lumpSumPaise;

  while (remainingSum > 0 && pool.length > 0) {
    const totalWeight = pool.reduce((s, p) => s + p.weight, 0);
    let spentThisPass = 0;
    const stillOpen: typeof pool = [];
    for (const p of pool) {
      const share = Math.floor((remainingSum * p.weight) / totalWeight);
      const give = Math.min(share, p.remaining);
      if (give > 0) {
        allocated.set(p.id, (allocated.get(p.id) ?? 0) + give);
        spentThisPass += give;
        p.remaining -= give;
      }
      if (p.remaining > 0) stillOpen.push(p);
    }
    remainingSum -= spentThisPass;
    pool = stillOpen;
    if (spentThisPass === 0) break; // rounding floor stalled further progress
  }

  return [...allocated.entries()].map(([piggyBankId, amountPaise]) => ({ piggyBankId, amountPaise }));
}

export type ReadinessVerdict = 'saving' | 'can_afford_now' | 'ready_check_price' | 'price_increased';

export interface PiggyBankReadiness {
  verdict: ReadinessVerdict;
  shortfallPaise: number; // > 0 only for 'price_increased'
  surplusPaise: number; // > 0 only for 'can_afford_now'
}

/** Re-checks the goal against the CURRENT best price rather than assuming
 *  "target reached" means "ready to buy" (features #21-23): a price can
 *  drop early (afford it now) or rise past what was saved (need more, or
 *  other options) between when the goal was set and today. */
export function piggyBankReadiness(bank: PiggyBank, currentBestPricePaise: number): PiggyBankReadiness {
  if (bank.savedPaise >= currentBestPricePaise) {
    return { verdict: 'can_afford_now', shortfallPaise: 0, surplusPaise: bank.savedPaise - currentBestPricePaise };
  }
  if (bank.savedPaise >= bank.targetPaise) {
    return { verdict: 'price_increased', shortfallPaise: currentBestPricePaise - bank.savedPaise, surplusPaise: 0 };
  }
  if (bank.savedPaise >= bank.targetPaise * 0.95) {
    return { verdict: 'ready_check_price', shortfallPaise: Math.max(0, currentBestPricePaise - bank.savedPaise), surplusPaise: 0 };
  }
  return { verdict: 'saving', shortfallPaise: 0, surplusPaise: 0 };
}

export interface SettleResult { spentPaise: number; leftoverPaise: number; }

/** Buying at `actualPricePaise` — whatever's saved beyond that is leftover
 *  (feature #24), handed back to the caller to offer "return to wallet" or
 *  "move to another goal"; this function only does the arithmetic. */
export function settlePiggyBank(bank: PiggyBank, actualPricePaise: number): SettleResult {
  const spentPaise = Math.min(bank.savedPaise, actualPricePaise);
  const leftoverPaise = bank.savedPaise - spentPaise;
  return { spentPaise, leftoverPaise };
}
