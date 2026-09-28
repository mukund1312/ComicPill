import { db } from '../client';
import { shown as shownTable } from '../schema';
import { newId } from '../../util/id';
import type { TodaySlots } from '../../types/engine-io';

export function recordShown(slots: TodaySlots, now: Date): void {
  const shownAt = now.toISOString();
  const rows: (typeof shownTable.$inferInsert)[] = [];
  const slotEntries: Array<[keyof TodaySlots & string, TodaySlots['continueSlot']]> = [
    ['continueSlot', slots.continueSlot], ['switchSlot', slots.switchSlot], ['exploreSlot', slots.exploreSlot],
  ];
  const slotName: Record<string, string> = { continueSlot: 'continue', switchSlot: 'switch', exploreSlot: 'explore' };
  for (const [key, slot] of slotEntries) {
    if (!slot) continue;
    rows.push({ id: newId(), workId: slot.workId, slot: slotName[key], scoreParts: slot.parts, outcome: null, shownAt });
  }
  if (rows.length) db.insert(shownTable).values(rows).run();
}
