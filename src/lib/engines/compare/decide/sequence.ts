// Turns a ranking into an actual reading ORDER. Sorting by score can put a
// sequel above the book it follows; sequence planning never lets that stand.
import type { Evaluated } from './constraints';
import type { Relationship } from './types';

/** Story-order edges among the books being compared: `before` must be read
 *  before `after`. Only unfinished predecessors that are IN the comparison
 *  matter — a finished predecessor has nothing to order. */
export function storyEdges(items: Evaluated[]): { before: Evaluated; after: Evaluated }[] {
  const byId = new Map(items.map((e) => [e.workId, e]));
  const edges: { before: Evaluated; after: Evaluated }[] = [];
  for (const after of items) {
    for (const p of after.input.predecessors) {
      const before = byId.get(p.workId);
      if (before && p.state !== 'finished') edges.push({ before, after });
    }
  }
  return edges;
}

/** Pull each predecessor to just before the book that follows it. Stable and
 *  deterministic; a cycle in the data cannot loop forever. */
export function enforceStoryOrder(ordered: Evaluated[]): Evaluated[] {
  const out = [...ordered];
  const edges = storyEdges(out);
  const limit = out.length * out.length + 1;
  for (let pass = 0; pass < limit; pass += 1) {
    let moved = false;
    for (const { before, after } of edges) {
      const bi = out.indexOf(before);
      const ai = out.indexOf(after);
      if (bi > ai) {
        out.splice(bi, 1);
        out.splice(ai, 0, before);
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }
  return out;
}

export function storyRelationships(items: Evaluated[]): Relationship[] {
  return storyEdges(items).map(({ before, after }) => ({
    from: before.workId, to: after.workId, relation: 'RECOMMENDED_BEFORE' as const, basis: 'STORY_ORDER' as const,
    reason: `${before.title} comes before ${after.title} in the story.`,
  }));
}
