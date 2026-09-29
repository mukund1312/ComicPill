import { describe, expect, it } from 'vitest';
import { dailyEquivalent, projectCompletionDate, savingsPlanSummary, autoAllocate, piggyBankReadiness, settlePiggyBank } from './piggybank';
import type { PiggyBank, SavingRule } from '../../types/domain';

function bank(overrides: Partial<PiggyBank> = {}): PiggyBank {
  return { id: 'b1', workId: 'w', editionId: null, name: 'Test', targetPaise: 500000, savedPaise: 0, status: 'saving', priority: 0, createdAt: '2026-01-01', ...overrides };
}
function rule(frequency: SavingRule['frequency'], amountPaise: number, customEveryDays: number | null = null): SavingRule {
  return { id: 'r1', piggyBankId: 'b1', amountPaise, frequency, customEveryDays };
}

describe('dailyEquivalent', () => {
  it('converts each frequency to a per-day rate', () => {
    expect(dailyEquivalent(rule('daily', 5000))).toBe(5000);
    expect(dailyEquivalent(rule('weekly', 7000))).toBe(1000);
    expect(dailyEquivalent(rule('monthly', 30000))).toBe(1000);
    expect(dailyEquivalent(rule('custom', 900, 3))).toBe(300);
    expect(dailyEquivalent(rule('manual', 100000))).toBe(0);
  });
});

describe('projectCompletionDate', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  it('projects forward by remaining / daily rate', () => {
    const b = bank({ targetPaise: 500000, savedPaise: 100000 });
    const date = projectCompletionDate(b, rule('daily', 10000), now);
    expect(date?.toISOString()).toBe(new Date(now.getTime() + 40 * 24 * 60 * 60 * 1000).toISOString());
  });
  it('returns null for a manual-only schedule', () => {
    expect(projectCompletionDate(bank({ savedPaise: 0 }), rule('manual', 0), now)).toBeNull();
  });
  it('returns now when already fully funded', () => {
    const b = bank({ targetPaise: 500000, savedPaise: 500000 });
    expect(projectCompletionDate(b, rule('daily', 1000), now)?.getTime()).toBe(now.getTime());
  });
});

describe('savingsPlanSummary', () => {
  it('warns when savings would eat a large share of the budget, without blocking', () => {
    const banks = [
      { bank: bank({ id: 'a' }), rule: rule('daily', 5000) },
      { bank: bank({ id: 'b' }), rule: rule('daily', 3000) },
    ];
    const summary = savingsPlanSummary(banks, 400000); // 8000/day * 30 = 240000, 60% of 400000
    expect(summary.totalDailyPaise).toBe(8000);
    expect(summary.percentOfBudget).toBeCloseTo(0.6);
    expect(summary.warning).toMatch(/60%/);
  });
  it('has no warning well under the threshold', () => {
    const banks = [{ bank: bank(), rule: rule('daily', 1000) }];
    const summary = savingsPlanSummary(banks, 1000000);
    expect(summary.warning).toBeNull();
  });
});

describe('autoAllocate', () => {
  it('distributes proportionally to remaining need, never exceeding a target', () => {
    const banks = [bank({ id: 'small', targetPaise: 10000, savedPaise: 0, priority: 0 }), bank({ id: 'big', targetPaise: 990000, savedPaise: 0, priority: 0 })];
    const result = autoAllocate(100000, banks);
    const bySmall = result.find((r) => r.piggyBankId === 'small')!;
    const byBig = result.find((r) => r.piggyBankId === 'big')!;
    expect(bySmall.amountPaise).toBeLessThanOrEqual(10000);
    expect(bySmall.amountPaise + byBig.amountPaise).toBeLessThanOrEqual(100000);
    expect(byBig.amountPaise).toBeGreaterThan(bySmall.amountPaise);
  });
  it('redistributes leftover from a capped small goal to goals with room', () => {
    const banks = [bank({ id: 'tiny', targetPaise: 100, savedPaise: 0 }), bank({ id: 'roomy', targetPaise: 100000, savedPaise: 0 })];
    const result = autoAllocate(50000, banks);
    const tiny = result.find((r) => r.piggyBankId === 'tiny')!;
    const roomy = result.find((r) => r.piggyBankId === 'roomy')!;
    expect(tiny.amountPaise).toBe(100); // capped exactly at its target
    expect(roomy.amountPaise).toBe(49900); // absorbs the rest
  });
  it('excludes non-saving or already-full banks', () => {
    const banks = [bank({ id: 'done', targetPaise: 1000, savedPaise: 1000 }), bank({ id: 'cancelled', status: 'cancelled' })];
    expect(autoAllocate(50000, banks)).toEqual([]);
  });
});

describe('piggyBankReadiness', () => {
  it('can_afford_now when saved already covers the current price', () => {
    const r = piggyBankReadiness(bank({ targetPaise: 500000, savedPaise: 450000 }), 400000);
    expect(r.verdict).toBe('can_afford_now');
    expect(r.surplusPaise).toBe(50000);
  });
  it('price_increased when target was reached but price has since risen', () => {
    const r = piggyBankReadiness(bank({ targetPaise: 500000, savedPaise: 500000 }), 550000);
    expect(r.verdict).toBe('price_increased');
    expect(r.shortfallPaise).toBe(50000);
  });
  it('ready_check_price when very close to target but not there yet', () => {
    const r = piggyBankReadiness(bank({ targetPaise: 500000, savedPaise: 480000 }), 500000);
    expect(r.verdict).toBe('ready_check_price');
  });
  it('saving when still far from the goal', () => {
    const r = piggyBankReadiness(bank({ targetPaise: 500000, savedPaise: 100000 }), 500000);
    expect(r.verdict).toBe('saving');
  });
});

describe('settlePiggyBank', () => {
  it('spends only what the purchase costs, returns the rest as leftover', () => {
    const result = settlePiggyBank(bank({ savedPaise: 500000 }), 429900);
    expect(result).toEqual({ spentPaise: 429900, leftoverPaise: 70100 });
  });
  it('never spends more than what was saved', () => {
    const result = settlePiggyBank(bank({ savedPaise: 300000 }), 500000);
    expect(result).toEqual({ spentPaise: 300000, leftoverPaise: 0 });
  });
});
