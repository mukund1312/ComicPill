// The hidden shelf's pure rules: what counts as a good new password, and where the sliding panel settles. No device or database here.
import { passwordProblem } from './lock';

/** What is wrong with a new password and its confirmation, or null when both are fine. */
export function newPasswordProblem(password: string, confirmation: string): string | null {
  return passwordProblem(password) ?? (password !== confirmation ? 'The two passwords don’t match.' : null);
}

// ---- the sliding panel --------------------------------------------------------------------------------------------------------------
export type PanelStop = 'closed' | 'half' | 'open';

/**
 * Where the panel settles when the finger lets go. `dx` is how far it was pulled (negative = towards the left, i.e. opening) and `vx` the
 * speed at release. A pull past a quarter of the width, or a quick flick left, opens it halfway (to ask for the password); anything less
 * springs back shut. It never opens fully from a swipe: only the right password does that.
 */
export function settleAfterSwipe(dx: number, vx: number, width: number): Exclude<PanelStop, 'open'> {
  if (vx < -600 && dx < -24) return 'half';
  if (vx > 600) return 'closed';
  return -dx > width * 0.25 ? 'half' : 'closed';
}

/** The panel's offset from the right edge for a stop (0 = covering the screen). */
export const offsetFor = (stop: PanelStop, width: number): number => (stop === 'open' ? 0 : stop === 'half' ? width / 2 : width);
