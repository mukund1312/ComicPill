// One place that decides where Next and Previous go, for every way of asking (on-screen buttons, taps, swipes, arrow keys, volume keys) and
// every reading mode. "Next" always means forward in the reading sequence and "Previous" backward; reading direction only changes which
// physical direction (left/right) a gesture or arrow key stands for, never what Next means.
export type NavMode = 'page' | 'panel' | 'bubble';
export type Direction = 'ltr' | 'rtl';
export type Step = 1 | -1;

/** Where the reader is: a page (0-based) and, in panel or bubble mode, which item on it (0-based). Page mode always has index 0. */
export type NavPosition = { page: number; index: number };

export type NavResult =
  | { kind: 'moved'; position: NavPosition; crossedPage: boolean }
  /** Already at the very first or last position of the comic. */
  | { kind: 'edge' };

/** How many panels/bubbles a page has, in this mode. Async because they may still have to be detected. Page mode never asks. */
export type ItemCounter = (page: number) => Promise<number>;

/** Pages are searched this far for one that has something to read, so a run of empty pages cannot trap the reader or make a press hang. */
export const MAX_EMPTY_PAGES_SKIPPED = 12;

/** Forward/backward for a physical direction: LTR reads rightwards, RTL leftwards. The other direction is always the opposite step. */
export function stepForSide(side: 'left' | 'right', direction: Direction): Step {
  const forwardSide = direction === 'ltr' ? 'right' : 'left';
  return side === forwardSide ? 1 : -1;
}

/** The side a Next control belongs on, and which way its arrow points: the way the reading goes. */
export function nextSide(direction: Direction): 'left' | 'right' { return direction === 'ltr' ? 'right' : 'left'; }

/** The volume keys: Up is always Next, Down is always Previous, whatever the reading direction. */
export function stepForVolume(key: 'up' | 'down'): Step { return key === 'up' ? 1 : -1; }

/**
 * One step from `at`. In page mode that is the next page. In panel/bubble mode it is the next item on the page, or, past the last one,
 * the first item of the next page that has any (and the last of the previous page going back). Pages with nothing to read are passed over.
 */
export async function stepPosition(at: NavPosition, delta: Step, mode: NavMode, pageCount: number, count: ItemCounter): Promise<NavResult> {
  if (pageCount <= 0) return { kind: 'edge' };
  const page = Math.min(pageCount - 1, Math.max(0, at.page));
  if (mode === 'page') {
    const next = page + delta;
    return next < 0 || next >= pageCount ? { kind: 'edge' } : { kind: 'moved', position: { page: next, index: 0 }, crossedPage: true };
  }
  const here = await count(page);
  const index = Math.min(Math.max(0, at.index), Math.max(0, here - 1));
  const inside = index + delta;
  if (inside >= 0 && inside < here) return { kind: 'moved', position: { page, index: inside }, crossedPage: false };
  // Off the end of this page: the nearest page in that direction with anything to read.
  let skipped = 0;
  for (let p = page + delta; p >= 0 && p < pageCount; p += delta) {
    const n = await count(p);
    if (n > 0) return { kind: 'moved', position: { page: p, index: delta > 0 ? 0 : n - 1 }, crossedPage: true };
    if (++skipped >= MAX_EMPTY_PAGES_SKIPPED) {
      // Too many empty pages in a row: land on the page itself, ready to read whatever is there once it can be.
      return { kind: 'moved', position: { page: p, index: 0 }, crossedPage: true };
    }
  }
  return { kind: 'edge' };
}

/** The closest sensible position when the reading mode changes: always the same page; the item is kept only if the new mode has that many. */
export function positionForMode(at: NavPosition, to: NavMode, remembered: Partial<Record<NavMode, NavPosition>>): NavPosition {
  if (to === 'page') return { page: at.page, index: 0 };
  const back = remembered[to];
  return back && back.page === at.page ? back : { page: at.page, index: 0 };
}

/**
 * Presses are handled one at a time, in order. A press that arrives while the previous one is still working (a page crossing that is waiting on
 * detection) is queued rather than lost or run twice; a few are kept, so a held button cannot pile up a long backlog.
 */
export function makeSerialQueue(max = 3) {
  let busy = false; const waiting: Array<() => Promise<void>> = [];
  const drain = async () => {
    if (busy) return;
    busy = true;
    try { for (let job = waiting.shift(); job; job = waiting.shift()) await job().catch(() => undefined); } finally { busy = false; }
  };
  return (job: () => Promise<void>) => { if (waiting.length < max) { waiting.push(job); void drain(); } };
}
