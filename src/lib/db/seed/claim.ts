// Seeds the global catalog (works/editions/paths/path_items/story_edges) for
// EVERYONE, and separately, ONLY for the developer's own device, claims the
// personal ownership/read-history rows from the Longbox prototype.
//
// This is the fix for the bug the plan calls out explicitly: a naive seed
// that also copied own/status into every new signup would hand user #2
// someone else's shelf. DEV_LIBRARY_ENTRIES is never applied unless
// isDevSeedUser() says so.
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
  const existing = db.select().from(works).limit(1).all();
  if (existing.length > 0) return;

  db.insert(works).values(
    CATALOG_WORKS.map((w) => ({
      id: w.id, title: w.title, sortTitle: w.sortTitle, matchKey: w.matchKey,
      universe: w.universe, fingerprint: w.fingerprint, genres: w.genres,
      creators: w.creators, characters: w.characters, keeperFlag: w.keeperFlag,
      contextNeeded: 'none', summary: w.summary,
      fingerprintPromptVersion: FINGERPRINT_PROMPT_VERSION,
    })),
  ).run();

  db.insert(editions).values(
    CATALOG_EDITIONS.map((e) => ({ id: e.id, format: e.format, printing: e.printing, formatNote: e.formatNote })),
  ).run();

  db.insert(editionWorks).values(
    CATALOG_EDITION_WORKS.map((ew) => ({ editionId: ew.editionId, workId: ew.workId, position: ew.position })),
  ).run();

  db.insert(paths).values(
    CATALOG_PATHS.map((p) => ({ id: p.id, name: p.name, pathKey: p.pathKey, contextLevel: 'recommended' })),
  ).run();

  db.insert(pathItems).values(
    CATALOG_PATH_ITEMS.map((pi) => ({ pathId: pi.pathId, workId: pi.workId, position: pi.position })),
  ).run();

  if (CATALOG_EDGES.length) {
    db.insert(storyEdges).values(
      CATALOG_EDGES.map((e) => ({ id: newId(), fromWork: e.fromWork, toWork: e.toWork, type: e.type, confirmed: e.confirmed, source: 'seed' })),
    ).run();
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
  claimDevLibraryIfEmpty();
}
