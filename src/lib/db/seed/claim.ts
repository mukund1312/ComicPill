// Seeds the global catalog (works/editions/paths/path_items/story_edges) for
// EVERYONE, and separately, ONLY for the developer's own device, claims the
// personal ownership/read-history rows from the Longbox prototype.
//
// This is the fix for the bug the plan calls out explicitly: a naive seed
// that also copied own/status into every new signup would hand user #2
// someone else's shelf. DEV_LIBRARY_ENTRIES is never applied unless
// isDevSeedUser() says so.
import { eq, isNull } from 'drizzle-orm';
import { db } from '../client';
import { works, editions, editionWorks, paths, pathItems, storyEdges, userLibrary } from '../schema';
import {
  CATALOG_WORKS, CATALOG_EDITIONS, CATALOG_EDITION_WORKS, CATALOG_PATHS, CATALOG_PATH_ITEMS, CATALOG_EDGES,
  DEV_LIBRARY_ENTRIES, FINGERPRINT_PROMPT_VERSION,
} from './catalog';
import { newId } from '../../util/id';

/** Gate for the dev-only personal library claim. In this local-only pass
 *  there is exactly one device and one implicit user, so this is always the
 *  dev user — flip to a real auth check once Supabase sign-in is wired. */
export function isDevSeedUser(): boolean {
  return __DEV__;
}

export function seedCatalogIfEmpty(): void {
  // Catalog additions must reach devices that already have an older seed.
  // Only rows for genuinely new work ids are inserted, so the function stays
  // safe to call at every bootstrap without duplicating joins or path items.
  const existingWorkIds = new Set(db.select({ id: works.id }).from(works).all().map((work) => work.id));
  const newWorks = CATALOG_WORKS.filter((work) => !existingWorkIds.has(work.id));
  if (!newWorks.length) return;
  const newWorkIds = new Set(newWorks.map((work) => work.id));
  const newEditionWorks = CATALOG_EDITION_WORKS.filter((editionWork) => newWorkIds.has(editionWork.workId));
  const newEditionIds = new Set(newEditionWorks.map((editionWork) => editionWork.editionId));

  db.insert(works).values(
    newWorks.map((w) => ({
      id: w.id, title: w.title, sortTitle: w.sortTitle, matchKey: w.matchKey,
      universe: w.universe, fingerprint: w.fingerprint, genres: w.genres,
      creators: w.creators, characters: w.characters, publisher: w.publisher, keeperFlag: w.keeperFlag,
      contextNeeded: 'none', summary: w.summary,
      fingerprintPromptVersion: FINGERPRINT_PROMPT_VERSION,
    })),
  ).run();

  db.insert(editions).values(
    CATALOG_EDITIONS.filter((edition) => newEditionIds.has(edition.id))
      .map((e) => ({ id: e.id, format: e.format, printing: e.printing, formatNote: e.formatNote, typicalPricePaise: e.typicalPricePaise })),
  ).run();

  db.insert(editionWorks).values(
    newEditionWorks
      .map((ew) => ({ editionId: ew.editionId, workId: ew.workId, position: ew.position })),
  ).run();

  const existingPathIds = new Set(db.select({ id: paths.id }).from(paths).all().map((path) => path.id));
  db.insert(paths).values(
    CATALOG_PATHS.filter((path) => !existingPathIds.has(path.id))
      .map((p) => ({ id: p.id, name: p.name, pathKey: p.pathKey, contextLevel: 'recommended' })),
  ).run();

  db.insert(pathItems).values(
    CATALOG_PATH_ITEMS.filter((pathItem) => newWorkIds.has(pathItem.workId))
      .map((pi) => ({ pathId: pi.pathId, workId: pi.workId, position: pi.position })),
  ).run();

  const newEdges = CATALOG_EDGES.filter((edge) => newWorkIds.has(edge.fromWork) || newWorkIds.has(edge.toWork));
  if (newEdges.length) {
    db.insert(storyEdges).values(
      newEdges.map((e) => ({ id: newId(), fromWork: e.fromWork, toWork: e.toWork, type: e.type, confirmed: e.confirmed, source: 'seed' })),
    ).run();
  }
}

/** publisher was added to the catalog after this app's first seed passes
 *  shipped, so a device seeded earlier has every work's publisher stuck at
 *  its schema default (null) forever — seedCatalogIfEmpty() only ever
 *  INSERTs genuinely new work ids, it never revisits existing rows. The
 *  cheap check (one SELECT) runs every bootstrap; the actual ~270-row
 *  backfill only runs once per device, the first time it finds any null.
 *  (A future correction to inferPublisher() won't retroactively reach an
 *  already-backfilled device — same as any other seed-data fix — but 273
 *  synchronous UPDATEs on every single cold start would work against the
 *  app's own "fast, quick, crisp" startup budget for a case this rare.) */
export function backfillPublishers(): void {
  const anyMissing = db.select({ id: works.id }).from(works).where(isNull(works.publisher)).limit(1).all();
  if (anyMissing.length === 0) return;
  for (const w of CATALOG_WORKS) {
    db.update(works).set({ publisher: w.publisher }).where(eq(works.id, w.id)).run();
  }
}

export function claimDevLibraryIfEmpty(): void {
  if (!isDevSeedUser()) return;
  const existing = db.select().from(userLibrary).limit(1).all();
  if (existing.length > 0) return;

  const now = new Date().toISOString();
  db.insert(userLibrary).values(
    DEV_LIBRARY_ENTRIES.map((e) => ({
      workId: e.workId, own: e.own, status: e.status,
      rating: null, finishedAt: null, updatedAt: now,
    })),
  ).run();
}

export function bootstrap(): void {
  seedCatalogIfEmpty();
  backfillPublishers();
  claimDevLibraryIfEmpty();
}
