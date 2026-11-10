import { describe, expect, it } from 'vitest';
import { combineUnit, fromUnit, slotAt, slotFor, toUnit, unitPanels, unitSlots } from './unitLayout';
import { FULL_PAGE } from './guided/panels';

const sizes = [{ width: 1000, height: 1500 }, { width: 1000, height: 1500 }, null];

describe('unitSlots', () => {
  it('is one slot filling the unit for a single page', () => {
    expect(unitSlots([0], sizes, false)).toEqual([{ page: 0, x: 0, w: 1 }]);
  });
  it('splits a spread by page shape, first page on the left (right for manga)', () => {
    const ltr = unitSlots([0, 1], sizes, false); expect(ltr[0].x).toBe(0); expect(ltr[0].w).toBeCloseTo(0.5, 6); expect(ltr[1].x).toBeCloseTo(0.5, 6);
    const rtl = unitSlots([0, 1], sizes, true); expect(rtl[0].x).toBeCloseTo(0.5, 6); expect(rtl[1].x).toBe(0);
  });
  it('gives a wider page more room, and halves when a size is unknown', () => {
    const s = unitSlots([0, 1], [{ width: 1000, height: 1500 }, { width: 2000, height: 1500 }], false); expect(s[1].w).toBeGreaterThan(s[0].w);
    expect(unitSlots([1, 2], sizes, false).map((x) => x.w)).toEqual([0.5, 0.5]);
  });
});

describe('moving boxes between a page and its unit', () => {
  const slots = unitSlots([0, 1], sizes, false);
  it('round-trips', () => {
    const b = { x: 0.2, y: 0.3, w: 0.3, h: 0.1 };
    const u = toUnit(slots[1], b); expect(u.x).toBeCloseTo(0.5 + 0.1, 6); expect(u.w).toBeCloseTo(0.15, 6);
    const back = fromUnit(slots[1], u); expect(back.x).toBeCloseTo(b.x, 6); expect(back.w).toBeCloseTo(b.w, 6);
  });
  it('finds the page under a point, and clips a box to a page', () => {
    expect(slotAt(slots, 0.2).page).toBe(0); expect(slotAt(slots, 0.8).page).toBe(1);
    expect(fromUnit(slots[0], { x: 0.4, y: 0, w: 0.3, h: 1 }).w).toBeCloseTo(0.2, 6); // only the part on the left page
    expect(slotFor(slots, 1).page).toBe(1);
  });
  it('moves polygon outlines too', () => {
    const t = toUnit(slots[1], { x: 0, y: 0, w: 1, h: 1, poly: [[0, 0], [1, 0], [0, 1]] });
    expect(t.poly![1][0]).toBeCloseTo(1, 6); expect(t.poly![0][0]).toBeCloseTo(0.5, 6);
  });
});

describe('combineUnit', () => {
  it('keeps reading order (page one then page two) with each item\'s origin', () => {
    const slots = unitSlots([0, 1], sizes, false);
    const { items, meta } = combineUnit([0, 1], slots, { 0: [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }], 1: [{ x: 0, y: 0, w: 1, h: 1 }] });
    expect(meta).toEqual([{ page: 0, local: 0 }, { page: 0, local: 1 }, { page: 1, local: 0 }]);
    expect(items[2].x).toBeCloseTo(0.5, 6);
  });
  it('a page with no panels is one whole-page panel, and a single page keeps the placeholder itself', () => {
    const single = unitPanels([0], unitSlots([0], sizes, false), {});
    expect(single.items[0]).toBe(FULL_PAGE);
    const spread = unitPanels([0, 1], unitSlots([0, 1], sizes, false), { 0: [] });
    expect(spread.items).toHaveLength(2); expect(spread.items[0].w).toBeCloseTo(0.5, 6);
  });
});
