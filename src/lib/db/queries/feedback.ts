// Local issue log. No backend to send to — see the FeedbackEntry domain
// type. Deliberately excluded from resetDatabase(): a dev-data reset should
// never silently wipe out issues the user actually logged.
import { desc, eq } from 'drizzle-orm';
import { db } from '../client';
import { feedback } from '../schema';
import { newId } from '../../util/id';
import type { FeedbackCategory, FeedbackEntry } from '../../types/domain';

export function addFeedback(category: FeedbackCategory, message: string, screen: string | null = null): FeedbackEntry {
  const entry: FeedbackEntry = { id: newId(), category, message, screen, createdAt: new Date().toISOString() };
  db.insert(feedback).values(entry).run();
  return entry;
}

export function listFeedback(): FeedbackEntry[] {
  return db.select().from(feedback).orderBy(desc(feedback.createdAt)).all()
    .map((row) => ({ ...row, category: row.category as FeedbackCategory }));
}

export function deleteFeedback(id: string): void {
  db.delete(feedback).where(eq(feedback.id, id)).run();
}

/** A plain-text dump, newest first — meant to be copied out and pasted
 *  directly to the dev, since there's no server this ever gets sent to. */
export function exportFeedbackText(): string {
  const entries = listFeedback();
  if (entries.length === 0) return 'No feedback logged yet.';
  return entries.map((e) => {
    const date = new Date(e.createdAt).toLocaleString('en-IN');
    const where = e.screen ? ` (${e.screen})` : '';
    return `[${e.category.toUpperCase()}]${where} ${date}\n${e.message}`;
  }).join('\n\n---\n\n');
}
