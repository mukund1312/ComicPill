// The words and groupings the Compare results screen shows. Pure, so the
// rules ("finished books are explained, not ranked"; "a role label describes
// the book, the number gives the order") are tested without rendering.
import type { Intent, RankedEntry, ReadDecision } from '../../lib/engines/compare/decide/types';

export const INTENT_CHIPS: { id: Intent; label: string }[] = [
  { id: 'best', label: 'Best overall' },
  { id: 'continue_path', label: 'Continue a path' },
  { id: 'darkest', label: 'Darkest' },
  { id: 'short', label: 'Short read' },
  { id: 'different', label: 'Something different' },
];

export type RoleTone = 'go' | 'wait' | 'neutral';

/** A role describes the book's job; the position number gives the order. */
export function roleBadge(e: Pick<RankedEntry, 'role' | 'blockers'>): { label: string; tone: RoleTone } {
  switch (e.role) {
    case 'read_now': return { label: 'READ NOW', tone: 'go' };
    case 'read_after': return { label: 'READ AFTER', tone: 'neutral' };
    case 'detour': return { label: 'DETOUR', tone: 'neutral' };
    case 'later': return { label: 'LATER', tone: 'neutral' };
    case 'get_first': return { label: 'GET IT FIRST', tone: 'wait' };
    case 'blocked': return { label: e.blockers[0] ? `READ ${e.blockers[0].data.previous.toUpperCase()} FIRST` : 'NOT YET', tone: 'wait' };
  }
}

/** One quiet line saying the ranking was reshaped, so a changed answer is
 *  visibly explained. */
export function intentNote(intent: Intent): string | null {
  switch (intent) {
    case 'continue_path': return 'Ranked to continue your path.';
    case 'darkest': return 'Ranked for the darkest story.';
    case 'short': return 'Ranked for the shortest read.';
    case 'different': return 'Ranked for a change of pace.';
    case 'best': return null;
  }
}

export function excludedLine(e: ReadDecision['excluded'][number]): string {
  return e.reason === 'already_finished' ? '✓ Already finished' : 'Set aside';
}

/** The primary action label depends on whether the pick can be read tonight. */
export function primaryAction(decision: ReadDecision): string {
  const top = decision.order[0];
  if (!top) return '';
  if (top.tier === 0) return top.isReread ? 'Reread it' : 'Start reading';
  return 'See how to read it';
}

/** Whether the "include rereads" control is worth showing. */
export const hasRereadable = (d: ReadDecision) => d.excluded.some((e) => e.canReread);
