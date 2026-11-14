import { describe, expect, it } from 'vitest';
import { newPasswordProblem, offsetFor, settleAfterSwipe } from './hiddenShelfCore';

describe('hidden shelf panel', () => {
  const W = 400;
  it('opens halfway once pulled past a quarter of the width', () => {
    expect(settleAfterSwipe(-120, -100, W)).toBe('half');
    expect(settleAfterSwipe(-90, -100, W)).toBe('closed');
  });
  it('a quick flick to the left opens it even when short', () => {
    expect(settleAfterSwipe(-40, -900, W)).toBe('half');
    expect(settleAfterSwipe(-10, -900, W)).toBe('closed'); // a twitch is not a flick
  });
  it('flicking back to the right shuts it', () => {
    expect(settleAfterSwipe(-200, 800, W)).toBe('closed');
  });
  it('never opens fully from a swipe: only the password does that', () => {
    for (const dx of [-50, -150, -300, -400, -800]) expect(settleAfterSwipe(dx, -2000, W)).not.toBe('open');
  });
  it('places each stop', () => {
    expect(offsetFor('closed', W)).toBe(400);
    expect(offsetFor('half', W)).toBe(200);
    expect(offsetFor('open', W)).toBe(0);
  });
});

describe('hidden shelf password', () => {
  it('needs 4+ characters typed the same twice', () => {
    expect(newPasswordProblem('abc', 'abc')).toMatch(/at least 4/);
    expect(newPasswordProblem('abcd', 'abce')).toMatch(/match/);
    expect(newPasswordProblem('abcd', 'abcd')).toBeNull();
  });
});
