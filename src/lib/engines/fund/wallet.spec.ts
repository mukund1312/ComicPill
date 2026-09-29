import { describe, expect, it } from 'vitest';
import { cycleStart, computeWalletSnapshot } from './wallet';
import type { WalletConfig, WalletLedgerEntry, PiggyBank } from '../../types/domain';

function entry(type: WalletLedgerEntry['type'], amountPaise: number, occurredAt: string): WalletLedgerEntry {
  return { id: `${type}-${occurredAt}`, type, amountPaise, piggyBankId: null, workId: null, note: null, occurredAt };
}
function bank(id: string, savedPaise: number, status: PiggyBank['status'] = 'saving'): PiggyBank {
  return { id, workId: 'w', editionId: null, name: id, targetPaise: 100000, savedPaise, status, priority: 0, createdAt: '2026-01-01' };
}

describe('cycleStart', () => {
  it('rolls back to the reset day within the current month when past it', () => {
    expect(cycleStart(new Date('2026-09-15T00:00:00Z'), 1).toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });
  it('rolls back to last month when before this month’s reset day', () => {
    expect(cycleStart(new Date('2026-09-15T00:00:00Z'), 20).toISOString()).toBe('2026-08-20T00:00:00.000Z');
  });
  it('clamps a reset day past a short month’s length', () => {
    // Feb 2026 has 28 days, so this cycle's clamped reset day is Feb 28 —
    // Feb 15 hasn't reached it yet, so the cycle in progress started at
    // January's clamped day (30) instead.
    expect(cycleStart(new Date('2026-02-15T00:00:00Z'), 30).toISOString()).toBe('2026-01-30T00:00:00.000Z');
    expect(cycleStart(new Date('2026-03-01T00:00:00Z'), 30).toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });
});

describe('computeWalletSnapshot', () => {
  const config: WalletConfig = { monthlyBudgetPaise: 500000, budgetResetDay: 1, rolloverEnabled: false, savingsCountsTowardBudget: true };
  const now = new Date('2026-09-15T00:00:00Z');

  it('computes available as top-ups minus purchases minus contributions, plus refunds', () => {
    const ledger = [
      entry('top_up', 1000000, '2026-08-01T00:00:00Z'),
      entry('purchase', 200000, '2026-09-05T00:00:00Z'),
      entry('piggy_contribution', 100000, '2026-09-10T00:00:00Z'),
      entry('piggy_refund', 50000, '2026-09-12T00:00:00Z'),
    ];
    const snap = computeWalletSnapshot(config, ledger, [], now);
    expect(snap.availablePaise).toBe(1000000 - 200000 - 100000 + 50000);
  });

  it('reserved is the sum of active (saving/ready) piggy banks only', () => {
    const banks = [bank('a', 100000, 'saving'), bank('b', 50000, 'ready'), bank('c', 999999, 'purchased'), bank('d', 111, 'cancelled')];
    const snap = computeWalletSnapshot(config, [], banks, now);
    expect(snap.reservedPaise).toBe(150000);
  });

  it('budget remaining only counts this cycle’s spend and contributions, and can go negative', () => {
    const ledger = [
      entry('purchase', 300000, '2026-09-05T00:00:00Z'), // this cycle
      entry('purchase', 999999, '2026-08-05T00:00:00Z'), // last cycle, excluded
      entry('piggy_contribution', 300000, '2026-09-06T00:00:00Z'), // this cycle
    ];
    const snap = computeWalletSnapshot(config, ledger, [], now);
    expect(snap.spentThisCyclePaise).toBe(300000);
    expect(snap.budgetRemainingPaise).toBe(500000 - 300000 - 300000);
  });

  it('contributions do not count toward budget when the toggle is off', () => {
    const off: WalletConfig = { ...config, savingsCountsTowardBudget: false };
    const ledger = [entry('piggy_contribution', 400000, '2026-09-06T00:00:00Z')];
    const snap = computeWalletSnapshot(off, ledger, [], now);
    expect(snap.budgetRemainingPaise).toBe(500000);
  });
});
