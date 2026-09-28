import type { TodayInput, ScorableWork } from '../../types/engine-io';

/** The four exclusion clauses. A book is removed if any is true:
 *  - finished, dropped, or swiped left in the last 60 days (via excludedWorkIds)
 *  - a required_context parent is unread
 *  - "not tonight" was tapped on it in the last 3 days
 *  - "only books I own" is on and you don't own it
 */
export function filterCandidates(input: TodayInput, now: Date): ScorableWork[] {
  const notTonightRecent = new Set(
    input.recentNotTonight
      .filter((nt) => now.getTime() - new Date(nt.at).getTime() < 3 * 24 * 60 * 60 * 1000)
      .map((nt) => nt.workId),
  );

  const finishedOrReading = new Set(input.recentFinished.map((r) => r.workId));

  return input.works.filter((w) => {
    if (input.excludedWorkIds.has(w.id)) return false;
    if (notTonightRecent.has(w.id)) return false;
    if (input.ownedOnly && w.own === 'none') return false;
    if (w.contextNeeded === 'required') {
      const parentsUnread = w.requiredParentIds.some((p) => !finishedOrReading.has(p));
      if (parentsUnread) return false;
    }
    return true;
  });
}
