import { unitsOf, type ReadingOrder, type Series } from './types';

export type WeekFind = { series: Series; score: number; order: ReadingOrder };

export type Slot = {
  seriesId: string;
  title: string;
  kind: 'prerequisite' | 'start';
  /** 1-based, inclusive. */
  fromUnit: number;
  toUnit: number;
  startDay: string;
  endDay: string;
  /** The find this slot is in service of. */
  forId: string;
};

export type WeekPlan = { slots: Slot[]; thisWeek: string[]; upNext: string[]; unitsPlanned: number };

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Fit the week's finds into the reader's capacity (issues or volumes a week).
 * Highest score first: its unfinished prerequisites, then the first unit of the title itself.
 * A find whose title can't be started this week moves to "Up next" — though prerequisites that fit are still read.
 */
export function planWeek(finds: WeekFind[], capacity: number, startDayIndex: number, readingDays = 7): WeekPlan {
  const cap = Math.max(0, Math.floor(capacity));
  const days = Math.max(1, Math.min(7, readingDays));
  const perDay = Math.max(1, Math.ceil(cap / days));
  const dayOf = (unitIndex: number) => DAY_NAMES[(startDayIndex + Math.min(days - 1, Math.floor(unitIndex / perDay))) % 7];

  const slots: Slot[] = []; const thisWeek: string[] = []; const upNext: string[] = [];
  const scheduled = new Set<string>(); // a prerequisite shared by two finds is read once
  let used = 0;

  for (const find of [...finds].sort((a, b) => b.score - a.score || a.series.title.localeCompare(b.series.title))) {
    let blocked = false;
    for (const pre of find.order.readFirst) {
      if (scheduled.has(pre.id)) continue;
      const room = cap - used;
      if (room <= 0) { blocked = true; break; }
      const take = Math.min(room, pre.units);
      slots.push({ seriesId: pre.id, title: pre.title, kind: 'prerequisite', fromUnit: 1, toUnit: take, startDay: dayOf(used), endDay: dayOf(used + take - 1), forId: find.series.id });
      used += take;
      if (take < pre.units) { blocked = true; break; } // only part of it fits; the rest carries over
      scheduled.add(pre.id);
    }
    if (!blocked && cap - used >= 1) {
      slots.push({ seriesId: find.series.id, title: find.series.title, kind: 'start', fromUnit: 1, toUnit: 1, startDay: dayOf(used), endDay: dayOf(used), forId: find.series.id });
      used += 1; scheduled.add(find.series.id); thisWeek.push(find.series.id);
    } else {
      upNext.push(find.series.id);
    }
  }
  return { slots, thisWeek, upNext, unitsPlanned: used };
}

/** "Read Saga vol. 1–2 by Wednesday, then start Paper Girls this weekend." */
export function describeSlot(slot: Slot): string {
  const range = slot.fromUnit === slot.toUnit ? `${slot.fromUnit}` : `${slot.fromUnit}–${slot.toUnit}`;
  if (slot.kind === 'start') return `Start ${slot.title} on ${slot.startDay}`;
  return `Read ${slot.title} vol. ${range} by ${slot.endDay}`;
}

export const _unitsOf = unitsOf;
