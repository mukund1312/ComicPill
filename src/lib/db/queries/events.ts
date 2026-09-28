import { desc } from 'drizzle-orm';
import { db } from '../client';
import { events as eventsTable, notTonight as notTonightTable } from '../schema';
import { toTasteEvent, fromTasteEvent } from '../map';
import type { TasteEvent } from '../../types/domain';
import { newId } from '../../util/id';

export function appendEvent(event: Omit<TasteEvent, 'id'> & { id?: string }): TasteEvent {
  const full: TasteEvent = { id: event.id ?? newId(), ...event } as TasteEvent;
  db.insert(eventsTable).values(fromTasteEvent(full)).run();
  return full;
}

export function loadAllEvents(): TasteEvent[] {
  return db.select().from(eventsTable).orderBy(desc(eventsTable.occurredAt)).all().map(toTasteEvent).reverse();
}

export function recordNotTonight(workId: string, at: string): void {
  db.insert(notTonightTable).values({ id: newId(), workId, at }).run();
}

export function loadRecentNotTonight(sinceIso: string) {
  return db.select().from(notTonightTable).all()
    .filter((r) => r.at >= sinceIso)
    .map((r) => ({ workId: r.workId, bucket: '', at: r.at })); // bucket filled in by the caller, which has the work map
}
