import { eq } from 'drizzle-orm';
import { db } from '../client';
import { works, editions, editionWorks, pathItems, paths, userLibrary, storyEdges } from '../schema';
import { toScorableWork, toStoryEdge, type WorkContext } from '../map';
import type { ScorableWork } from '../../types/engine-io';
import type { Own, ReadStatus } from '../../types/domain';

/** All works joined with every edition that collects them (via edition_works
 *  — an omnibus can list several works, which is why this is a join, not a
 *  direct foreign key), the library entry, and the owning path's bucket key.
 *  One pass, no N+1. */
export function loadAllWorkContexts(): WorkContext[] {
  const allWorks = db.select().from(works).all();
  const allEditions = db.select().from(editions).all();
  const allEditionWorks = db.select().from(editionWorks).all();
  const allLibrary = db.select().from(userLibrary).all();
  const allPathItems = db.select().from(pathItems).all();
  const allPaths = db.select().from(paths).all();

  const editionById = new Map(allEditions.map((e) => [e.id, e]));
  const editionsByWork = new Map<string, (typeof allEditions)>();
  for (const ew of allEditionWorks) {
    const edition = editionById.get(ew.editionId);
    if (!edition) continue;
    const list = editionsByWork.get(ew.workId) ?? [];
    list.push(edition);
    editionsByWork.set(ew.workId, list);
  }
  const libraryByWork = new Map(allLibrary.map((l) => [l.workId, l]));
  const pathKeyById = new Map(allPaths.map((p) => [p.id, p.pathKey]));
  const bucketByWork = new Map(allPathItems.map((pi) => [pi.workId, pathKeyById.get(pi.pathId) ?? 'other']));

  return allWorks.map((work) => ({
    work,
    editions: editionsByWork.get(work.id) ?? [],
    library: libraryByWork.get(work.id) ?? null,
    bucket: bucketByWork.get(work.id) ?? 'other',
  }));
}

export function loadAllEdges() {
  return db.select().from(storyEdges).all().map(toStoryEdge);
}

/** Every work as a pure ScorableWork, with required_context parents resolved. */
export function loadAllScorableWorks(): Map<string, ScorableWork> {
  const contexts = loadAllWorkContexts();
  const edges = loadAllEdges();
  const requiredParentsByWork = new Map<string, string[]>();
  for (const e of edges) {
    if (e.type !== 'required_context') continue;
    const list = requiredParentsByWork.get(e.toWork) ?? [];
    list.push(e.fromWork);
    requiredParentsByWork.set(e.toWork, list);
  }
  const map = new Map<string, ScorableWork>();
  for (const ctx of contexts) {
    map.set(ctx.work.id, toScorableWork(ctx, requiredParentsByWork.get(ctx.work.id) ?? []));
  }
  return map;
}

export function upsertLibraryEntry(workId: string, fields: Partial<{ own: Own; status: ReadStatus; rating: number | null; finishedAt: string | null }>): void {
  const now = new Date().toISOString();
  const existing = db.select().from(userLibrary).where(eq(userLibrary.workId, workId)).get();
  if (existing) {
    db.update(userLibrary).set({ ...fields, updatedAt: now }).where(eq(userLibrary.workId, workId)).run();
  } else {
    db.insert(userLibrary).values({
      workId, own: fields.own ?? 'none', status: fields.status ?? 'none',
      rating: fields.rating ?? null, finishedAt: fields.finishedAt ?? null, updatedAt: now,
    }).run();
  }
}

export function listLibrary() {
  return loadAllWorkContexts();
}
