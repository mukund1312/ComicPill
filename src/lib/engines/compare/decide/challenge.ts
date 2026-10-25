// "You already own something better than any of these." Compare the best
// book OUTSIDE the chosen set against the set's own winner, on the same
// weights, and only interrupt when the difference is clear.
import type { ReadDecision } from './types';

/** How much better an outsider must be before Compare interrupts. */
export const CHALLENGE_MARGIN = 0.15;

export interface Challenge { workId: string; title: string; message: string; because: string }

export function challengeFor(chosen: ReadDecision, pool: ReadDecision): Challenge | null {
  const best = pool.order[0];
  if (!best || best.tier !== 0 || !pool.primary) return null;
  if (chosen.order.some((e) => e.workId === best.workId)) return null;

  const mine = chosen.order[0];
  if (mine && mine.tier === 0 && best.priority - mine.priority < CHALLENGE_MARGIN) return null;

  return {
    workId: best.workId,
    title: best.title,
    message: !mine
      ? 'Everything here is already read — here is what is next for you.'
      : mine.tier === 1
        ? 'None of these is ready to read tonight, but you already have something that is.'
        : 'You already have a better option than any of these.',
    because: pool.primary.explanation,
  };
}
