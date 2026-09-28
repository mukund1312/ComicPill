import type { ContextLevel } from '../../types/domain';
import type { StoryEdge } from '../../types/engine-io';
import { LEVEL_EDGES } from './edges';

export interface PathItem { workId: string; position: number; }
export interface LibraryIndex { status: Map<string, 'none' | 'reading' | 'done' | 'dropped'>; }

/** Simple ⊂ Recommended ⊂ Completionist by construction: expand a seed list by
 *  following only the edge types this level allows. */
export function expandPath(seed: string[], edges: StoryEdge[], level: ContextLevel): PathItem[] {
  const allowed = new Set(LEVEL_EDGES[level]);
  const items = new Map<string, number>();
  seed.forEach((id, i) => items.set(id, i * 10));

  let changed = true;
  let guard = 0;
  while (changed && guard < 1000) {
    changed = false;
    guard += 1;
    for (const edge of edges) {
      if (!allowed.has(edge.type)) continue;
      if (!edge.confirmed && edge.type !== 'direct_sequel') continue; // unconfirmed only ever orders, never introduces
      if (items.has(edge.fromWork) && !items.has(edge.toWork)) {
        items.set(edge.toWork, items.get(edge.fromWork)! + 1);
        changed = true;
      }
    }
  }
  return [...items.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([workId, position], i) => ({ workId, position: i }));
}

export function nextInPath(items: PathItem[], lib: LibraryIndex): string | null {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const reading = sorted.find((i) => lib.status.get(i.workId) === 'reading');
  if (reading) return reading.workId;
  const next = sorted.find((i) => {
    const s = lib.status.get(i.workId) ?? 'none';
    return s !== 'done' && s !== 'dropped';
  });
  return next?.workId ?? null;
}

export function readyToRead(
  workId: string,
  edges: StoryEdge[],
  lib: LibraryIndex,
): { ready: boolean; blockedBy: string[] } {
  const requiredParents = edges
    .filter((e) => e.toWork === workId && e.type === 'required_context')
    .map((e) => e.fromWork);
  const blockedBy = requiredParents.filter((p) => lib.status.get(p) !== 'done');
  return { ready: blockedBy.length === 0, blockedBy };
}

/** P: 1 if next in a path you're reading, 0.5 if next in a path you haven't
 *  started, 0 otherwise. */
export function pathReadiness(
  workId: string,
  pathsForWork: Array<{ items: PathItem[]; isReading: boolean; hasStarted: boolean }>,
  lib: LibraryIndex,
): number {
  for (const p of pathsForWork) {
    if (nextInPath(p.items, lib) === workId) {
      if (p.isReading) return 1;
      if (!p.hasStarted) return 0.5;
    }
  }
  return 0;
}
