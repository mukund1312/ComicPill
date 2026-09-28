import { describe, expect, it } from 'vitest';
import { updateAffinity, clamp, sign } from '../taste/affinity';

describe('updateAffinity', () => {
  it('a positive weight never decreases the affinity', () => {
    expect(updateAffinity(0, 0, 1)).toBeGreaterThan(0);
    expect(updateAffinity(0.3, 5, 0.5)).toBeGreaterThanOrEqual(0.3);
  });

  it('a negative weight never increases the affinity', () => {
    expect(updateAffinity(0, 0, -1)).toBeLessThan(0);
    expect(updateAffinity(-0.3, 5, -0.5)).toBeLessThanOrEqual(-0.3);
  });

  it('a zero weight is the identity', () => {
    expect(updateAffinity(0.42, 3, 0)).toBe(0.42);
  });

  it('the step size strictly shrinks as n grows, for the same weight', () => {
    const steps = [0, 1, 2, 3, 5, 10].map((n) => updateAffinity(0, n, 1));
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
  });

  it('never escapes [-1, 1] over many repeated strong updates', () => {
    let a = 0;
    for (let n = 0; n < 50; n++) a = updateAffinity(a, n, 1);
    expect(a).toBeLessThanOrEqual(1);
    a = 0;
    for (let n = 0; n < 50; n++) a = updateAffinity(a, n, -1);
    expect(a).toBeGreaterThanOrEqual(-1);
  });

  it('property: 2000 random (a, n, w) triples always stay in [-1, 1]', () => {
    for (let i = 0; i < 2000; i++) {
      const a = Math.random() * 2 - 1;
      const n = Math.floor(Math.random() * 50);
      const w = Math.random() * 4 - 2;
      const result = updateAffinity(a, n, w);
      expect(result).toBeGreaterThanOrEqual(-1);
      expect(result).toBeLessThanOrEqual(1);
    }
  });
});

describe('sign / clamp', () => {
  it('sign matches the mathematical definition', () => {
    expect(sign(5)).toBe(1);
    expect(sign(-5)).toBe(-1);
    expect(sign(0)).toBe(0);
  });
  it('clamp bounds a value to [lo, hi]', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});
