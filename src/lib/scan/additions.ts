// Turning a reviewed scan into library changes. Only what the reader ticked
// is added, and adding a copy in a new format keeps the format they already own.
import type { Own } from '../types/domain';
import { mergeOwn } from '../util/own';
import type { ScanMatch } from './match';

export type ScanFormat = 'physical' | 'digital';

/** Matched books start ticked; ones needing review start unticked, so a
 *  doubtful match is never added without the reader saying so. */
export function defaultSelection(matches: ScanMatch[]): Set<string> {
  return new Set(matches.filter((m) => m.status === 'matched' && m.workId).map((m) => m.workId!));
}

export function planAdditions(
  matches: ScanMatch[],
  selected: ReadonlySet<string>,
  format: ScanFormat,
  currentOwn: (workId: string) => Own,
): { workId: string; own: Own }[] {
  const seen = new Set<string>();
  const plan: { workId: string; own: Own }[] = [];
  for (const m of matches) {
    if (!m.workId || m.status === 'unmatched' || !selected.has(m.workId) || seen.has(m.workId)) continue;
    seen.add(m.workId);
    plan.push({ workId: m.workId, own: mergeOwn(currentOwn(m.workId), format) });
  }
  return plan;
}
