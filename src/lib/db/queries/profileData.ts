import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../client';
import { userLibrary, works } from '../schema';
import { sortHistory, type HistoryRow } from '../../settings/profileStats';

/** Everything the reader has finished or is reading, most recent first. */
export function loadHistory(): HistoryRow[] {
  const rows = db
    .select({ workId: userLibrary.workId, title: works.title, status: userLibrary.status, rating: userLibrary.rating, finishedAt: userLibrary.finishedAt, updatedAt: userLibrary.updatedAt })
    .from(userLibrary)
    .innerJoin(works, eq(userLibrary.workId, works.id))
    .where(inArray(userLibrary.status, ['done', 'reading']))
    .orderBy(desc(userLibrary.updatedAt))
    .all();
  return sortHistory(rows.map((r) => ({ ...r, status: r.status as HistoryRow['status'] })));
}
