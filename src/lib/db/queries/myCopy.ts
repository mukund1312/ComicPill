// The reader's own copy of a comic: do they own it, have they read it, what do they think of it.
import { eq } from 'drizzle-orm';
import { db } from '../client';
import { userLibrary } from '../schema';
import type { Own, ReadStatus } from '../../types/domain';
import { upsertLibraryEntry } from './library';

export type MyCopy = { own: Own; status: ReadStatus; rating: number | null; notes: string };

export function getMyCopy(workId: string): MyCopy {
  const row = db.select().from(userLibrary).where(eq(userLibrary.workId, workId)).get();
  return { own: (row?.own ?? 'none') as Own, status: (row?.status ?? 'none') as ReadStatus, rating: row?.rating ?? null, notes: row?.notes ?? '' };
}

export function saveMyCopy(workId: string, patch: Partial<MyCopy>): void {
  const { notes, ...rest } = patch;
  upsertLibraryEntry(workId, { ...rest, ...(notes === undefined ? {} : { notes: notes.trim() ? notes.trim() : null }), ...(patch.status === 'done' ? { finishedAt: new Date().toISOString() } : {}) });
}
