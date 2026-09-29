// The query/assembly layer for the Compare "what should I read?" engine —
// same seam as today.ts: this does every join and SQLite-specific lookup,
// the pure engine in engines/compare never sees a row.
import { db } from '../client';
import { paths, pathItems } from '../schema';
import { loadAllScorableWorks, loadAllWorkContexts } from './library';
import { getProfile } from './profile';
import { nextInPath, type LibraryIndex } from '../../engines/graph/path';
import { rankForRead, challengeWithAlternative } from '../../engines/compare/verdict';
import type { CompareContext, CompareWorkInput } from '../../engines/compare/dimensions';
import type { CompareChallenge, CompareResult } from '../../engines/compare/verdict';
import { isAccessible } from '../../util/own';
import type { ReadStatus } from '../../types/domain';
import type { ScorableWork } from '../../types/engine-io';

function buildContext(now: Date, mood: string | null): CompareContext {
  const profile = getProfile(now);
  const contexts = loadAllWorkContexts();
  const recentFinished = contexts
    .filter((c) => c.library?.status === 'done' && c.library.rating != null && c.library.finishedAt)
    .map((c) => ({
      workId: c.work.id, bucket: c.bucket, fingerprint: c.work.fingerprint as ScorableWork['fingerprint'],
      rating: c.library!.rating as 1 | 2 | 3 | 4 | 5, finishedAt: c.library!.finishedAt!,
    }))
    .sort((a, b) => (a.finishedAt < b.finishedAt ? 1 : -1));
  return { profile, mood, recentFinished };
}

/** For every work that's the very-next unread item in some path: whether
 *  that path is currently being actively read, just sitting unstarted, or
 *  (a third real case) partway through without anything marked 'reading' —
 *  which counts as 'none' here, exactly like Today's P score treats it. */
function buildPathStandingByWorkId(): Map<string, 'reading' | 'unstarted' | 'none'> {
  const contexts = loadAllWorkContexts();
  const statusByWork = new Map(contexts.map((c) => [c.work.id, (c.library?.status ?? 'none') as ReadStatus]));
  const libIndex: LibraryIndex = { status: statusByWork };
  const allPaths = db.select().from(paths).all();
  const allPathItems = db.select().from(pathItems).all();

  const standing = new Map<string, 'reading' | 'unstarted' | 'none'>();
  for (const p of allPaths) {
    const items = allPathItems.filter((pi) => pi.pathId === p.id).map((pi) => ({ workId: pi.workId, position: pi.position }));
    const next = nextInPath(items, libIndex);
    if (!next) continue;
    const isReading = items.some((i) => statusByWork.get(i.workId) === 'reading');
    const hasStarted = items.some((i) => (statusByWork.get(i.workId) ?? 'none') !== 'none');
    if (isReading) standing.set(next, 'reading');
    else if (!hasStarted) standing.set(next, 'unstarted');
  }
  return standing;
}

function readinessFor(work: ScorableWork, doneWorkIds: Set<string>, titleById: Map<string, string>): { isReady: boolean; blockedByTitles: string[] } {
  const blocked = work.requiredParentIds.filter((id) => !doneWorkIds.has(id));
  return { isReady: blocked.length === 0, blockedByTitles: blocked.map((id) => titleById.get(id) ?? id) };
}

function buildInputFor(work: ScorableWork, doneWorkIds: Set<string>, titleById: Map<string, string>, pathStandingByWorkId: Map<string, 'reading' | 'unstarted' | 'none'>): CompareWorkInput {
  const { isReady, blockedByTitles } = readinessFor(work, doneWorkIds, titleById);
  return { work, isReady, blockedByTitles, pathStanding: pathStandingByWorkId.get(work.id) ?? 'none' };
}

export interface CompareOutcome {
  results: CompareResult[];
  challenge: CompareChallenge | null;
}

/** The one entrypoint the Compare screen needs: rank the chosen works for
 *  "what should I read", and separately check whether a book the reader
 *  already owns (but didn't add to the comparison) beats all of them. */
export function compareWorks(workIds: string[], now: Date, mood: string | null = null): CompareOutcome {
  const worksById = loadAllScorableWorks();
  const contexts = loadAllWorkContexts();
  const doneWorkIds = new Set(contexts.filter((c) => c.library?.status === 'done').map((c) => c.work.id));
  const titleById = new Map(contexts.map((c) => [c.work.id, c.work.title]));
  const pathStandingByWorkId = buildPathStandingByWorkId();
  const ctx = buildContext(now, mood);

  const inputs = workIds
    .map((id) => worksById.get(id))
    .filter((w): w is ScorableWork => !!w)
    .map((w) => buildInputFor(w, doneWorkIds, titleById, pathStandingByWorkId));

  const results = rankForRead(inputs, ctx);

  // The challenge candidate: among everything NOT already in the compared
  // set, owned, and unread/not-dropped, whichever ranks best on the exact
  // same scoring this comparison just used. Bounded by the same catalog
  // pickToday already scores every open, so this stays well inside the
  // existing performance budget.
  const excludeIds = new Set(workIds);
  const alternativeCandidates = contexts
    .filter((c) => !excludeIds.has(c.work.id) && isAccessible((c.library?.own ?? 'none') as ScorableWork['own']) && c.library?.status !== 'done' && c.library?.status !== 'dropped')
    .map((c) => worksById.get(c.work.id))
    .filter((w): w is ScorableWork => !!w)
    .map((w) => buildInputFor(w, doneWorkIds, titleById, pathStandingByWorkId));

  let bestAlternative: CompareWorkInput | null = null;
  if (alternativeCandidates.length) {
    const rankedAlternatives = rankForRead(alternativeCandidates, ctx);
    const topId = rankedAlternatives.reduce((best, r) => (r.overallScore > best.overallScore ? r : best), rankedAlternatives[0]).workId;
    bestAlternative = alternativeCandidates.find((c) => c.work.id === topId) ?? null;
  }

  const challenge = bestAlternative ? challengeWithAlternative(results, bestAlternative, ctx) : null;
  return { results, challenge: challenge?.shouldChallenge ? challenge : null };
}
