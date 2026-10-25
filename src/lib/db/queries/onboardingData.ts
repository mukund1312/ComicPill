// Saving what onboarding learned. The reader's stated taste lives in two places
// on purpose: taste_signals (provenance — "you said this") and events (what the
// taste engine replays). Both are replaced as a set, so editing your picks later
// never leaves stale or duplicate signal behind, and never touches real reading history.
import { eq, like } from 'drizzle-orm';
import { db, sqlite } from '../client';
import { events as eventsTable, tasteSignals } from '../schema';
import { fromTasteEvent } from '../map';
import { buildSignals, ONBOARDING_EVENT_PREFIX, signalsToEvents, type TasteSelections } from '../../onboarding/taste';
import { invalidateProfile } from './profile';
import { listLibrary, upsertLibraryEntry } from './library';
import { toLibraryFields, type DraftItem, type DraftStats } from '../../onboarding/collectionDraft';
import type { Own, ReadStatus } from '../../types/domain';

export function saveOnboardingTaste(sel: TasteSelections, now: Date): void {
  const at = now.toISOString();
  const signals = buildSignals(sel);
  const events = signalsToEvents(sel, now);
  sqlite.withTransactionSync(() => {
    db.delete(tasteSignals).where(eq(tasteSignals.source, 'ONBOARDING')).run();
    db.delete(eventsTable).where(like(eventsTable.id, `${ONBOARDING_EVENT_PREFIX}%`)).run();
    for (const s of signals) {
      db.insert(tasteSignals).values({ id: `${s.entityType}:${s.entityId}`, ...s, createdAt: at }).run();
    }
    for (const e of events) db.insert(eventsTable).values(fromTasteEvent(e)).run();
  });
  invalidateProfile(now);
}

export function loadOnboardingSignalCount(): number {
  return sqlite.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM taste_signals WHERE source = 'ONBOARDING'")?.n ?? 0;
}

const OWNED_SQL = "('physical','digital','both','ordered','subscription')";

/** The library as it stands, in the same terms as the collection step. */
export function libraryStatsNow(): DraftStats {
  const n = (where: string): number => sqlite.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM user_library WHERE ${where}`)?.n ?? 0;
  const owned = n(`own IN ${OWNED_SQL}`);
  const wishlist = n("own = 'wishlist'");
  return {
    total: owned + wishlist, owned, wishlist,
    physical: n("own IN ('physical','both')"), digital: n("own IN ('digital','both')"),
    unread: n(`own IN ${OWNED_SQL} AND status = 'none'`), reading: n("status = 'reading'"), finished: n("status = 'done'"),
  };
}

/** Owned books that are not finished or dropped — what the first pick chooses among. */
export function readableLibraryIds(limit = 30): string[] {
  return sqlite.getAllSync<{ work_id: string }>(
    `SELECT work_id FROM user_library WHERE own IN ${OWNED_SQL} AND status IN ('none','reading') AND not_interested = 0 ORDER BY updated_at DESC LIMIT ?`, [limit],
  ).map((r) => r.work_id);
}

/** Write the confirmed books. Existing ownership is widened, progress never rewound (see toLibraryFields). */
export function saveCollectionDraft(draft: readonly DraftItem[]): number {
  const current = new Map(listLibrary().map((c) => [c.work.id, c.library]));
  sqlite.withTransactionSync(() => {
    for (const item of draft) {
      const cur = current.get(item.workId);
      const fields = toLibraryFields(item, { own: (cur?.own ?? 'none') as Own, status: (cur?.status ?? 'none') as ReadStatus });
      upsertLibraryEntry(item.workId, fields);
    }
  });
  return draft.length;
}
