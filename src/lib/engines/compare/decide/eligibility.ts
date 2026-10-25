// Who gets to take part in a "what should I read next?" ranking at all.
// Runs BEFORE any scoring: a finished book must never be ranked #1 for
// "read next" no matter how well it fits the reader's taste.
import type { CandidateInput, ComparisonContext, ExcludedEntry } from './types';

export function partitionCandidates(
  candidates: CandidateInput[],
  ctx: Pick<ComparisonContext, 'rereadsAllowed'>,
): { eligible: CandidateInput[]; excluded: ExcludedEntry[] } {
  const eligible: CandidateInput[] = [];
  const excluded: ExcludedEntry[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c.work.id)) continue;
    seen.add(c.work.id);
    if (c.state === 'finished' && !ctx.rereadsAllowed) {
      excluded.push({ workId: c.work.id, title: c.work.title, reason: 'already_finished', canReread: true });
    } else if (c.state === 'dropped') {
      excluded.push({ workId: c.work.id, title: c.work.title, reason: 'dropped', canReread: false });
    } else {
      eligible.push(c);
    }
  }
  return { eligible, excluded };
}
