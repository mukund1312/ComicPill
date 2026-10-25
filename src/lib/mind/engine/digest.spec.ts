import { describe, expect, it } from 'vitest';
import { buildDigest, nextDigestTime, weekKey, type FindInput } from './digest';
import { decideVerdict } from './verdictRules';
import type { PlanItem, Series } from './types';

const verdict = decideVerdict({ score: 90, confidence: 'high', artDriven: true, runStatus: 'finished', volumes: 6, print: 'in_print', priceRising: false, budgetRemaining: null, typicalPrice: 10 });
const pre = (id: string, units: number): PlanItem => ({ id, title: id.toUpperCase(), units, importance: 'required', confidence: 'verified', status: 'planned' });
const find = (id: string, score: number, readFirst: PlanItem[] = []): FindInput => ({
  series: { id, title: id.toUpperCase(), units: 6, status: 'planned' } as Series, score, confidence: 'high', reason: 'because', verdict, coverUrl: null, thumbUri: null, unverified: false,
  order: { readFirst, then: [], unitsToRead: readFirst.reduce((n, i) => n + i.units, 0) },
});
const opts = { week: '2026-10-25', builtAt: 1, capacity: 4, startDayIndex: 1, readingDays: 7 };

describe('buildDigest', () => {
  it('ranks this week’s finds, with plan lines naming the days', () => {
    const d = buildDigest([find('low', 50), find('high', 90, [pre('saga', 2)])], opts);
    expect(d.cards.map((c) => c.seriesId)).toEqual(['high', 'low']);
    expect(d.cards[0].plan).toEqual(['Read SAGA vol. 1–2 by Tuesday', 'Start HIGH on Wednesday']);
    expect(d.unitsPlanned).toBe(4);
    expect(d.headline).toContain('Read SAGA vol. 1–2');
  });

  it('what does not fit moves to Up next', () => {
    const d = buildDigest([find('a', 90, [pre('p', 3)]), find('b', 70)], { ...opts, capacity: 2 });
    expect(d.cards).toEqual([]);
    expect(d.upNext.map((c) => c.seriesId)).toEqual(['a', 'b']);
    expect(d.upNext[0].bucket).toBe('next');
    expect(d.headline).toMatch(/Read P vol\. 1–2/);
  });

  it('says so when there is nothing to read', () => {
    expect(buildDigest([], opts).headline).toBe('Nothing new this week.');
  });

  it('keeps each card’s verdict and reason', () => {
    const c = buildDigest([find('x', 80)], opts).cards[0];
    expect(c.verdict.outcome).toBe('buy_physical');
    expect(c.reason).toBe('because');
  });
});

describe('scheduling', () => {
  it('finds the next Sunday 6pm, never in the past', () => {
    const wed = new Date(2026, 9, 21, 12, 0); // Wed 21 Oct 2026
    expect(nextDigestTime(wed, 0, 18, 0)).toEqual(new Date(2026, 9, 25, 18, 0));
    const sunLate = new Date(2026, 9, 25, 19, 0);
    expect(nextDigestTime(sunLate, 0, 18, 0)).toEqual(new Date(2026, 10, 1, 18, 0));
    const sunEarly = new Date(2026, 9, 25, 9, 0);
    expect(nextDigestTime(sunEarly, 0, 18, 0)).toEqual(new Date(2026, 9, 25, 18, 0));
  });
  it('formats the week key', () => expect(weekKey(new Date(2026, 0, 5))).toBe('2026-01-05'));
});
