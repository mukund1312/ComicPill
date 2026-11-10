import { describe, expect, it } from 'vitest';
import { installNavigationGuard, makeRepeatGuard } from './tapGuard';

describe('makeRepeatGuard', () => {
  it('drops the same destination again within the window, and lets it through after', () => {
    let t = 0; const allow = makeRepeatGuard(() => t, 700);
    expect(allow('/profile')).toBe(true);
    t = 80; expect(allow('/profile')).toBe(false);
    t = 900; expect(allow('/profile')).toBe(true);
  });
  it('never blocks a different destination', () => {
    let t = 0; const allow = makeRepeatGuard(() => t, 700);
    expect(allow('/profile')).toBe(true); t = 10;
    expect(allow('/settings')).toBe(true);
    expect(allow({ pathname: '/comic/[id]', params: { id: 'a' } })).toBe(true);
    expect(allow({ pathname: '/comic/[id]', params: { id: 'b' } })).toBe(true);
  });
});

describe('installNavigationGuard', () => {
  it('wraps push so a double tap navigates once', () => {
    const calls: string[] = [];
    const router = { push: (h: string) => { calls.push(h); }, navigate: (h: string) => { calls.push(`nav:${h}`); } };
    installNavigationGuard(router as never); installNavigationGuard(router as never);
    router.push('/a'); router.push('/a'); router.push('/b');
    expect(calls).toEqual(['/a', '/b']);
  });
});
