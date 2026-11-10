// A quick second tap on something that navigates would open the same screen twice, so Back would land on a copy of it.
// This lets the first one through and drops the same destination again for a moment. A different destination always goes through.
export const REPEAT_WINDOW_MS = 700;

export function makeRepeatGuard(now: () => number = Date.now, windowMs = REPEAT_WINDOW_MS) {
  let last: { key: string; at: number } | null = null;
  return (href: unknown): boolean => {
    const key = typeof href === 'string' ? href : JSON.stringify(href);
    const t = now();
    if (last && last.key === key && t - last.at < windowMs) return false;
    last = { key, at: t };
    return true;
  };
}

type Pushes = { push: (...args: never[]) => unknown; navigate: (...args: never[]) => unknown };

/** Wraps router.push and router.navigate once, at start-up. */
export function installNavigationGuard(router: Pushes): void {
  const marked = router as Pushes & { __tapGuard?: boolean };
  if (marked.__tapGuard) return;
  marked.__tapGuard = true;
  const allow = makeRepeatGuard();
  for (const name of ['push', 'navigate'] as const) {
    const original = router[name].bind(router) as (...args: unknown[]) => unknown;
    (router as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => (allow(args[0]) ? original(...args) : undefined);
  }
}
