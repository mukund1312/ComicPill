// Assembles Compare candidates from a snapshot of the reader's world. Pure,
// so the exact same code that runs in the app can be exercised in tests
// against the real catalog, the real story edges and a real shelf — the query
// layer only has to load the snapshot.
import type { ScorableWork } from '../../../types/engine-io';
import type { ArcMembership } from '../../arc/membership';
import type { CandidateInput, JourneyPosition, Predecessor, ReadingState } from './types';

export interface EdgeLike { fromWork: string; toWork: string; type: string }

export interface World {
  works: ReadonlyMap<string, ScorableWork>;
  state: (workId: string) => ReadingState;
  /** Edges keyed by the book they point AT (its predecessors). */
  predecessorEdges: ReadonlyMap<string, EdgeLike[]>;
  journey: (workId: string) => JourneyPosition | null;
}

/** Only edges that mean "read this first" order or gate anything. Lane
 *  adjacency ('same_run'), tone links and the like are not story order. */
const ORDERING_TYPES = new Set(['direct_sequel', 'required_context']);

export function indexPredecessors(edges: readonly EdgeLike[]): Map<string, EdgeLike[]> {
  const byTarget = new Map<string, EdgeLike[]>();
  for (const e of edges) {
    if (!ORDERING_TYPES.has(e.type)) continue;
    const list = byTarget.get(e.toWork) ?? [];
    list.push(e);
    byTarget.set(e.toWork, list);
  }
  return byTarget;
}

export function candidateFor(workId: string, world: World): CandidateInput | null {
  const work = world.works.get(workId);
  if (!work) return null;

  const byFrom = new Map<string, Predecessor>();
  for (const e of world.predecessorEdges.get(workId) ?? []) {
    const from = world.works.get(e.fromWork);
    if (!from || e.fromWork === workId) continue;
    const kind = e.type === 'required_context' ? 'required_context' : 'direct_sequel';
    const existing = byFrom.get(e.fromWork);
    // If a pair is linked both ways, the stricter relationship wins.
    if (existing && existing.kind === 'required_context') continue;
    byFrom.set(e.fromWork, { workId: e.fromWork, title: from.title, state: world.state(e.fromWork), kind });
  }

  return { work, state: world.state(workId), journey: world.journey(workId), predecessors: [...byFrom.values()] };
}

/** A book counts as part of a journey only while it is still unread there. */
export function journeyFromMembership(m: ArcMembership | null): JourneyPosition | null {
  if (!m || m.state === 'finished' || m.state === 'dropped') return null;
  return { arcId: m.arcId, arcTitle: m.arcTitle, chapterTitle: m.chapterTitle, milestoneTitle: m.milestoneTitle, isNext: m.isNext };
}
