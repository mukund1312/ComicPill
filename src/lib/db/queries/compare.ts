// The query/assembly layer for the Compare "what should I read?" engine —
// same seam as today.ts: this does every join and SQLite-specific lookup,
// the pure engine in engines/compare never sees a row.
import { loadAllEdges, loadAllScorableWorks, loadAllWorkContexts } from './library';
import { getProfile } from './profile';
import { emptyProfile } from '../../engines/taste/profile';
import { useSettings } from '../../state/settings';
import { isAccessible } from '../../util/own';
import { loadActiveArcs, loadMemberships } from './arc';
import { primaryMembership } from '../../engines/arc/membership';
import { decideRead } from '../../engines/compare/decide/decide';
import { candidateFor, indexPredecessors, journeyFromMembership, type World } from '../../engines/compare/decide/build';
import { challengeFor, type Challenge } from '../../engines/compare/decide/challenge';
import type { ComparisonContext, Intent, ReadDecision, ReadingState, TravelMode } from '../../engines/compare/decide/types';
import type { ReadStatus } from '../../types/domain';
import type { FinishedRead, ScorableWork } from '../../types/engine-io';

function buildContext(now: Date, mood: string | null): { profile: ReturnType<typeof getProfile>; mood: string | null; recentFinished: FinishedRead[] } {
  const profile = useSettings.getState().personalizedRecommendations ? getProfile(now) : emptyProfile();
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

// ---- Compare V2 -------------------------------------------------------------

export interface ReadCompareOptions {
  now: Date;
  mood: string | null;
  intent: Intent;
  travelMode: TravelMode;
  rereadsAllowed: boolean;
}

export interface ReadCompareOutcome {
  decision: ReadDecision;
  /** A better book the reader already has, outside the chosen set. */
  challenge: Challenge | null;
}

const stateFrom = (status: ReadStatus): ReadingState =>
  status === 'done' ? 'finished' : status === 'none' ? 'unread' : status;

/** "What should I read next?" for the chosen books: eligibility, hard
 *  constraints, the reader's active journeys, pairwise reasoning and a real
 *  order — see engines/compare/decide. */
export function compareForRead(workIds: string[], opts: ReadCompareOptions): ReadCompareOutcome {
  const worksById = loadAllScorableWorks();
  const contexts = loadAllWorkContexts();
  const statusById = new Map(contexts.map((c) => [c.work.id, (c.library?.status ?? 'none') as ReadStatus]));
  const arcs = loadActiveArcs();
  const memberships = loadMemberships(arcs);

  const world: World = {
    works: worksById,
    state: (id) => stateFrom(statusById.get(id) ?? 'none'),
    predecessorEdges: indexPredecessors(loadAllEdges()),
    journey: (id) => journeyFromMembership(primaryMembership(memberships.get(id))),
  };

  const base = buildContext(opts.now, opts.mood);
  const ctx: ComparisonContext = {
    profile: base.profile,
    recentFinished: base.recentFinished,
    mood: opts.mood,
    intent: opts.intent,
    travelMode: opts.travelMode,
    rereadsAllowed: opts.rereadsAllowed,
    currentlyReading: contexts.filter((c) => c.library?.status === 'reading').map((c) => ({ workId: c.work.id, title: c.work.title })),
    activeJourneys: arcs.map((a) => a.plan.title),
    titleById: new Map(contexts.map((c) => [c.work.id, c.work.title])),
  };

  const chosen = workIds.flatMap((id) => { const c = candidateFor(id, world); return c ? [c] : []; });
  const decision = decideRead(chosen, ctx);

  // Anything the reader already has and hasn't finished, that isn't in the set.
  const chosenIds = new Set(workIds);
  const pool = [...worksById.keys()]
    .filter((id) => !chosenIds.has(id) && isAccessible(worksById.get(id)!.own) && world.state(id) !== 'finished' && world.state(id) !== 'dropped')
    .flatMap((id) => { const c = candidateFor(id, world); return c ? [c] : []; });
  const challenge = pool.length ? challengeFor(decision, decideRead(pool, { ...ctx, rereadsAllowed: false })) : null;

  return { decision, challenge };
}
