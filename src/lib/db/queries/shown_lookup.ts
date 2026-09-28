import { desc, eq } from 'drizzle-orm';
import { db } from '../client';
import { shown as shownTable } from '../schema';

/** Was this work most recently shown in the Explore slot? Used to decide
 *  whether finishing it should move adventurousness/exploration rate. */
export function wasLastShownAsExplore(workId: string): boolean {
  const row = db.select().from(shownTable).where(eq(shownTable.workId, workId)).orderBy(desc(shownTable.shownAt)).limit(1).get();
  return row?.slot === 'explore';
}
