import { unitsOf, type PlanItem, type PrereqEdge, type ReadingOrder, type Series } from './types';

const live = (edges: PrereqEdge[]) => edges.filter((e) => !e.wrong);

const byYearThenTitle = (a: Series, b: Series) => (a.year ?? 9999) - (b.year ?? 9999) || a.title.localeCompare(b.title);

function toItem(s: Series, e: PrereqEdge): PlanItem {
  return { id: s.id, title: s.title, units: unitsOf(s), importance: e.importance, confidence: e.confidence, status: s.status };
}

/**
 * "Read first" and "then" for one title.
 *  1. every Required prerequisite, walked backwards as far as it goes (cycle-safe),
 *  2. ordered oldest to newest without ever putting a title before its own prerequisite,
 *  3. Helpful ones after them, then the time cost of whatever is still unread,
 *  4. the same forwards for "then", two steps at most.
 * Finished and dropped titles stay out of the list, so marking something read updates the plan.
 */
export function readingOrder(targetId: string, series: Map<string, Series>, allEdges: PrereqEdge[]): ReadingOrder {
  const edges = live(allEdges);
  const unread = (s: Series | undefined): s is Series => !!s && s.status !== 'finished' && s.status !== 'dropped';

  // 1. Required ancestors (and the edge that brought each one in)
  const required = new Map<string, PrereqEdge>();
  const visited = new Set<string>([targetId]);
  const stack = [targetId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const e of edges) {
      if (e.after !== cur || e.importance !== 'required' || visited.has(e.before)) continue;
      visited.add(e.before); required.set(e.before, e); stack.push(e.before);
    }
  }

  // 2. Topological order among the required set, oldest first when there is a choice.
  const ids = [...required.keys()];
  const indegree = new Map(ids.map((id) => [id, 0]));
  for (const e of edges) if (indegree.has(e.before) && indegree.has(e.after)) indegree.set(e.after, indegree.get(e.after)! + 1);
  const ordered: string[] = [];
  const ready = ids.filter((id) => indegree.get(id) === 0);
  const pick = () => { ready.sort((a, b) => byYearThenTitle(series.get(a) ?? ({ id: a, title: a } as Series), series.get(b) ?? ({ id: b, title: b } as Series))); return ready.shift()!; };
  while (ready.length) {
    const id = pick(); ordered.push(id);
    for (const e of edges) if (e.before === id && indegree.has(e.after)) { indegree.set(e.after, indegree.get(e.after)! - 1); if (indegree.get(e.after) === 0) ready.push(e.after); }
  }
  for (const id of ids) if (!ordered.includes(id)) ordered.push(id); // a loop among required titles: keep them, in a stable order

  const readFirst: PlanItem[] = [];
  for (const id of ordered) { const s = series.get(id); if (unread(s)) readFirst.push(toItem(s, required.get(id)!)); }

  // 3. Helpful prerequisites of the target or of any required title, after the required ones.
  const chain = new Set([targetId, ...required.keys()]);
  const helpful = new Map<string, PrereqEdge>();
  for (const e of edges) if (e.importance === 'helpful' && chain.has(e.after) && !chain.has(e.before) && !helpful.has(e.before)) helpful.set(e.before, e);
  [...helpful.keys()]
    .map((id) => series.get(id)).filter(unread).sort(byYearThenTitle)
    .forEach((s) => readFirst.push(toItem(s, helpful.get(s.id)!)));

  // 4. Forwards: required then helpful, two steps at most.
  const then: PlanItem[] = [];
  const seen = new Set<string>([targetId, ...readFirst.map((i) => i.id)]);
  let frontier = [targetId];
  for (let step = 0; step < 2; step++) {
    const next: string[] = [];
    const found = edges
      .filter((e) => frontier.includes(e.before) && e.importance !== 'optional' && !seen.has(e.after))
      .sort((a, b) => (a.importance === b.importance ? 0 : a.importance === 'required' ? -1 : 1));
    for (const e of found) {
      if (seen.has(e.after)) continue;
      seen.add(e.after); next.push(e.after);
      const s = series.get(e.after);
      if (unread(s)) then.push(toItem(s, e));
    }
    frontier = next;
  }

  return { readFirst, then, unitsToRead: readFirst.reduce((n, i) => n + i.units, 0) };
}
