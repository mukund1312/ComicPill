// A reading unit is one page, or (landscape) two pages side by side like an open book. Panels and balloons are found and saved per page, in that
// page's own 0..1 coordinates; the camera, the mask and taps work on the whole unit. This maps between the two, so every feature behaves the same on a
// single page (one slot filling the unit) and on a spread (two slots).
import { FULL_PAGE, type Panel } from './guided/panels';

export type Slot = { page: number; x: number; w: number };
export type Box = { x: number; y: number; w: number; h: number };
type Size = { width: number; height: number } | null;
const DEFAULT_RATIO = 0.66;

/**
 * Where each page of the unit sits across the unit's width (fractions of it). Pages share one height, so a page's share is its width relative to the
 * other's. Same rule the page view uses to lay them out: by shape when every page's size is known, equal halves otherwise; a right-to-left unit puts
 * the first page on the right. Returned in unit (reading) order.
 */
export function unitSlots(unit: number[], sizes: Size[], rtl: boolean): Slot[] {
  const known = unit.every((p) => sizes[p]);
  const widths = unit.map((p) => (known ? (sizes[p] ? sizes[p]!.width / sizes[p]!.height : DEFAULT_RATIO) : 1));
  const total = widths.reduce((a, b) => a + b, 0);
  const visual = unit.map((_, i) => i); if (rtl) visual.reverse();
  const slots: Slot[] = new Array(unit.length); let x = 0;
  for (const i of visual) { slots[i] = { page: unit[i], x, w: widths[i] / total }; x += widths[i] / total; }
  return slots;
}

export const slotFor = (slots: Slot[], page: number): Slot => slots.find((s) => s.page === page) ?? slots[0];
/** The slot under a horizontal position in the unit (the nearest one when it falls in the gap or beyond). */
export function slotAt(slots: Slot[], x: number): Slot {
  return slots.find((s) => x >= s.x && x <= s.x + s.w) ?? slots.reduce((best, s) => (Math.abs(x - (s.x + s.w / 2)) < Math.abs(x - (best.x + best.w / 2)) ? s : best), slots[0]);
}

type Shaped = Box & { poly?: Array<[number, number]> };
/** A box in a page's own coordinates → the unit's. */
export function toUnit<T extends Shaped>(slot: Slot, b: T): T {
  return { ...b, x: slot.x + b.x * slot.w, w: b.w * slot.w, ...(b.poly ? { poly: b.poly.map(([px, py]) => [slot.x + px * slot.w, py] as [number, number]) } : {}) };
}
/** A box in the unit's coordinates → a page's own, clipped to that page. */
export function fromUnit(slot: Slot, b: Box): Box {
  const x0 = Math.max(slot.x, b.x); const x1 = Math.min(slot.x + slot.w, b.x + b.w);
  return { x: (x0 - slot.x) / slot.w, y: b.y, w: Math.max(0, x1 - x0) / slot.w, h: b.h };
}

export type Origin = { page: number; local: number };

/**
 * Every item of every page of the unit, in reading order (first page's, then the second's), each moved into the unit's coordinates, with where it came from
 * so an edit can go back to the right page. A single page keeps its items as they are (and the one-page "whole page" placeholder stays itself).
 */
export function combineUnit<T extends Shaped>(unit: number[], slots: Slot[], per: Record<number, T[] | undefined>, whole?: T): { items: T[]; meta: Origin[] } {
  const items: T[] = []; const meta: Origin[] = [];
  unit.forEach((page) => {
    const slot = slotFor(slots, page);
    (per[page] ?? []).forEach((item, local) => {
      items.push(slots.length === 1 && (item === whole || slot.w === 1) ? item : toUnit(slot, item)); meta.push({ page, local });
    });
  });
  return { items, meta };
}

/** Panels of a unit: a page with none is one panel, its whole self. */
export function unitPanels(unit: number[], slots: Slot[], per: Record<number, Panel[] | undefined>): { items: Panel[]; meta: Origin[] } {
  const filled: Record<number, Panel[]> = {};
  for (const p of unit) filled[p] = per[p] && per[p]!.length ? per[p]! : [FULL_PAGE];
  return combineUnit(unit, slots, filled, FULL_PAGE);
}
