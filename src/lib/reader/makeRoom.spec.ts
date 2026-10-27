import { describe, expect, it } from 'vitest';
import { isLowOnSpace, planRoom } from './makeRoom';

const r = (id: string, gb: number, lastReadAt: number) => ({ id, title: id, bytes: gb * 1e9, lastReadAt });

describe('planRoom', () => {
  it('needs nothing when the comic fits', () => {
    const plan = planRoom([r('a', 2, 1), r('b', 3, 2)], 10e9, 1e9);
    expect(plan.over).toBeLessThanOrEqual(0);
    expect(plan.suggested).toEqual([]);
  });
  it('suggests the least recently read comics until it fits', () => {
    const plan = planRoom([r('new', 4, 30), r('old', 3, 10), r('mid', 3, 20)], 10e9, 2e9);
    expect(plan.used).toBe(10e9);
    expect(plan.over).toBe(2e9);
    expect(plan.suggested).toEqual(['old']);
    expect(planRoom([r('new', 4, 30), r('old', 3, 10), r('mid', 3, 20)], 10e9, 5e9).suggested).toEqual(['old', 'mid']);
  });
  it('says so when a comic is bigger than the whole budget', () => {
    expect(planRoom([r('a', 1, 1)], 2e9, 5e9).possible).toBe(false);
    expect(planRoom([r('a', 1, 1)], 6e9, 5e9).possible).toBe(true);
  });
});

describe('isLowOnSpace', () => {
  it('keeps a reserve free for the system', () => {
    expect(isLowOnSpace(10e9, 1e9, 3e9)).toBe(false);
    expect(isLowOnSpace(3.5e9, 1e9, 3e9)).toBe(true);
  });
});
