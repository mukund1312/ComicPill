// Loads everything pickToday() needs, as plain objects. This is the seam
// between the db layer and the engines: the query does all the joining and
// SQLite-specific work; the engine that consumes it never sees a row.
import { db } from '../client';
import { paths, pathItems } from '../schema';
import { loadAllScorableWorks, loadAllEdges, loadAllWorkContexts } from './library';
import { getProfile } from './profile';
import { loadAllEvents, loadRecentNotTonight } from './events';
import { nextInPath, type LibraryIndex } from '../../engines/graph/path';
import type { TodayInput } from '../../types/engine-io';
import type { ReadStatus } from '../../types/domain';

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

export function loadTodayInput(
  now: Date,
  ownedOnly: boolean,
  formatFilter: TodayInput['formatFilter'] = 'any', // 'digital' = travel mode
): TodayInput {
  const worksById = loadAllScorableWorks();
  const works = [...worksById.values()];
  const edges = loadAllEdges();
  const profile = getProfile(now);
  const contexts = loadAllWorkContexts();

  const statusByWork = new Map(contexts.map((c) => [c.work.id, (c.library?.status ?? 'none') as ReadStatus]));
  const libIndex: LibraryIndex = { status: statusByWork };

  const allPaths = db.select().from(paths).all();
  const allPathItems = db.select().from(pathItems).all();

  const pathStatus: TodayInput['pathStatus'] = {};
  const nextWorkIdByBucket: TodayInput['nextWorkIdByBucket'] = {};
  for (const p of allPaths) {
    const items = allPathItems
      .filter((pi) => pi.pathId === p.id)
      .map((pi) => ({ workId: pi.workId, position: pi.position }));
    const isReading = items.some((i) => statusByWork.get(i.workId) === 'reading');
    const hasStarted = items.some((i) => (statusByWork.get(i.workId) ?? 'none') !== 'none');
    pathStatus[p.pathKey] = isReading ? 'reading' : hasStarted ? 'unstarted' : 'not_in_path';
    nextWorkIdByBucket[p.pathKey] = nextInPath(items, libIndex);
  }

  // Finished reads, most recent first, for fatigue/novelty/appetite.
  const recentFinished = contexts
    .filter((c) => c.library?.status === 'done' && c.library.rating != null && c.library.finishedAt)
    .map((c) => ({
      workId: c.work.id, bucket: c.bucket,
      fingerprint: c.work.fingerprint as any,
      rating: c.library!.rating as 1 | 2 | 3 | 4 | 5,
      finishedAt: c.library!.finishedAt!,
    }))
    .sort((a, b) => (a.finishedAt < b.finishedAt ? 1 : -1));

  const sinceIso = new Date(now.getTime() - SIXTY_DAYS_MS).toISOString();
  const recentNotTonightRaw = loadRecentNotTonight(sinceIso);
  const bucketByWork = new Map(contexts.map((c) => [c.work.id, c.bucket]));
  const recentNotTonight = recentNotTonightRaw.map((n) => ({ ...n, bucket: bucketByWork.get(n.workId) ?? '' }));

  // Excluded: finished/dropped, or swiped-left in the last 60 days (events log).
  const excludedWorkIds = new Set<string>();
  for (const c of contexts) {
    if (c.library?.status === 'done' || c.library?.status === 'dropped') excludedWorkIds.add(c.work.id);
  }
  const recentEvents = loadAllEvents().filter((e) => e.occurredAt >= sinceIso);
  for (const e of recentEvents) {
    if (e.type === 'swipe_left' && e.workId) excludedWorkIds.add(e.workId);
  }

  return {
    works, edges, profile, pathStatus, nextWorkIdByBucket, ownedOnly, formatFilter,
    recentFinished, recentNotTonight, excludedWorkIds,
  };
}
