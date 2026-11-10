import { describe, expect, it } from 'vitest';
import { bubbleAt, manualBubble, padBubble, toBubbles } from './bubbles';

describe('bubbles', () => {
  it('pads a box without leaving the page', () => {
    const p = padBubble({ x: 0.01, y: 0.01, w: 0.2, h: 0.05 });
    expect(p.x).toBe(0); expect(p.y).toBe(0); expect(p.w).toBeGreaterThan(0.2); expect(p.x + p.w).toBeLessThanOrEqual(1);
  });
  it('drops specks and page-sized boxes', () => {
    expect(toBubbles([{ x: 0.1, y: 0.1, w: 0.005, h: 0.005 }, { x: 0, y: 0, w: 1, h: 0.9 }, { x: 0.05, y: 0.1, w: 0.6, h: 0.34 }, { x: 0.3, y: 0.3, w: 0.2, h: 0.08 }])).toHaveLength(1);
  });
  it('picks the smallest bubble under the tap', () => {
    const b = [{ x: 0.1, y: 0.1, w: 0.5, h: 0.4 }, { x: 0.2, y: 0.2, w: 0.1, h: 0.1 }];
    expect(bubbleAt(b, 0.25, 0.25)).toBe(1);
    expect(bubbleAt(b, 0.5, 0.45)).toBe(0);
    expect(bubbleAt(b, 0.9, 0.9)).toBe(-1);
  });
  it('keeps the manual window on the page', () => {
    const m = manualBubble(0.99, 0.01, 1.5);
    expect(m.x + m.w).toBeLessThanOrEqual(1); expect(m.y).toBeGreaterThanOrEqual(0);
  });
});

import { growToBalloon } from './bubbles';

describe('growToBalloon', () => {
  // 100×100 dark page with a white balloon from (20,10) to (80,30) and dark "lettering" inside it.
  const page = () => {
    const g = new Uint8Array(100 * 100).fill(30);
    for (let y = 12; y < 28; y++) for (let x = 20; x < 70; x++) g[y * 100 + x] = 255;
    for (let y = 17; y < 23; y++) for (let x = 26; x < 50; x += 3) g[y * 100 + x] = 0; // thin strokes on a white ground
    return g;
  };
  it('grows from the text to the whole balloon', () => {
    const b = growToBalloon(page(), 100, 100, { x: 0.26, y: 0.17, w: 0.24, h: 0.06 })!;
    expect(b.x).toBeLessThan(0.2); expect(b.x + b.w).toBeGreaterThan(0.7); expect(b.y).toBeLessThan(0.12); expect(b.y + b.h).toBeGreaterThan(0.28);
    expect(b.x + b.w).toBeLessThan(0.8);
  });
  it('gives up when it leaks over a plain page', () => {
    expect(growToBalloon(new Uint8Array(100 * 100).fill(255), 100, 100, { x: 0.4, y: 0.4, w: 0.1, h: 0.05 })).toBeNull();
  });
});

import { boxFromCorners, insertInOrder } from './bubbles';

describe('manual balloons', () => {
  it('makes a box from two corners in any order, and ignores a stray tap', () => {
    expect(boxFromCorners(0.6, 0.5, 0.2, 0.3)).toEqual({ x: 0.2, y: 0.3, w: 0.39999999999999997, h: 0.2 });
    expect(boxFromCorners(0.5, 0.5, 0.51, 0.51)).toBeNull();
  });
  it('puts a new balloon in reading order', () => {
    const list = [{ x: 0.1, y: 0.1, w: 0.2, h: 0.05 }, { x: 0.5, y: 0.6, w: 0.2, h: 0.05 }];
    const { list: out, index } = insertInOrder(list, { x: 0.2, y: 0.3, w: 0.2, h: 0.05 }, false);
    expect(index).toBe(1); expect(out).toHaveLength(3); expect(out[1].y).toBe(0.3);
  });
});

import { dedupeBubbles } from './bubbles';

describe('dedupeBubbles', () => {
  it('drops a box that mostly sits on one already kept, and keeps separate ones', () => {
    const a = { x: 0.1, y: 0.1, w: 0.3, h: 0.1 };
    const out = dedupeBubbles([a, { x: 0.12, y: 0.11, w: 0.2, h: 0.08 }, { x: 0.6, y: 0.6, w: 0.2, h: 0.1 }]);
    expect(out).toHaveLength(2); expect(out[0]).toBe(a);
  });
});

import { clampBubbleSize, settleRect } from './pop';

describe('lift placement', () => {
  const view = { width: 1080, height: 2400 };
  it('grows right over the original, so there is never a second copy elsewhere', () => {
    const from = { x: 400, y: 1000, w: 260, h: 110 };
    const to = settleRect(from, view);
    expect(to.x).toBeLessThanOrEqual(from.x); expect(to.y).toBeLessThanOrEqual(from.y);
    expect(to.x + to.w).toBeGreaterThanOrEqual(from.x + from.w); expect(to.y + to.h).toBeGreaterThanOrEqual(from.y + from.h);
  });
  it('still covers the original when the balloon sits against a corner of the screen', () => {
    for (const from of [{ x: 5, y: 8, w: 180, h: 80 }, { x: 890, y: 8, w: 180, h: 80 }, { x: 5, y: 2300, w: 180, h: 80 }, { x: 895, y: 2310, w: 180, h: 80 }]) {
      const to = settleRect(from, view);
      expect(to.x).toBeLessThanOrEqual(from.x + 1e-6); expect(to.y).toBeLessThanOrEqual(from.y + 1e-6);
      expect(to.x + to.w).toBeGreaterThanOrEqual(from.x + from.w - 1e-6); expect(to.y + to.h).toBeGreaterThanOrEqual(from.y + from.h - 1e-6);
      expect(to.x).toBeGreaterThanOrEqual(-1e-6); expect(to.x + to.w).toBeLessThanOrEqual(view.width + 1e-6);
    }
  });
  it('slides back from a screen edge by as little as it takes, and stays whole', () => {
    const from = { x: 20, y: 40, w: 260, h: 110 };
    const to = settleRect(from, view);
    expect(to.x).toBeGreaterThanOrEqual(0); expect(to.y).toBeGreaterThanOrEqual(0);
    expect(to.x + to.w).toBeLessThanOrEqual(view.width); expect(to.w).toBeGreaterThan(from.w);
  });
});

describe('bubble size preference', () => {
  const from = { x: 100, y: 300, w: 220, h: 90 }; const view = { width: 1080, height: 2400 };
  it('makes the lifted balloon smaller or larger on request, keeping its shape', () => {
    const base = settleRect(from, view); const small = settleRect(from, view, { size: 0.6 }); const big = settleRect(from, view, { size: 1.5 });
    expect(small.w).toBeLessThan(base.w); expect(big.w).toBeGreaterThanOrEqual(base.w);
    expect(big.w / big.h).toBeCloseTo(from.w / from.h, 5);
  });
  it('never shrinks below the balloon itself, nor grows past the screen', () => {
    expect(settleRect(from, view, { size: 0.01 }).w).toBeGreaterThanOrEqual(from.w - 1e-6);
    const huge = settleRect(from, view, { size: 100 });
    expect(huge.w).toBeLessThanOrEqual(view.width); expect(huge.x).toBeGreaterThanOrEqual(0); expect(huge.x + huge.w).toBeLessThanOrEqual(view.width);
  });
  it('keeps the setting in range', () => {
    expect(clampBubbleSize(0.1)).toBe(0.5); expect(clampBubbleSize(9)).toBe(1.6); expect(clampBubbleSize(1.1)).toBe(1.1);
  });
});

describe('growToBalloon with touching balloons', () => {
  it('does not run on into the neighbouring balloon', () => {
    // 200×100 dark page: two white balloons side by side joined by a bridge of white.
    const w = 200; const h = 100; const g = new Uint8Array(w * h).fill(40);
    for (let y = 30; y < 70; y++) { for (let x = 10; x < 90; x++) g[y * w + x] = 250; for (let x = 110; x < 190; x++) g[y * w + x] = 250; for (let x = 90; x < 110; x++) if (y > 45 && y < 55) g[y * w + x] = 250; }
    for (let y = 40; y < 60; y++) for (let x = 25; x < 75; x += 3) g[y * w + x] = 0; // lettering in the left balloon
    const grown = growToBalloon(g, w, h, { x: 0.12, y: 0.4, w: 0.26, h: 0.2 })!;
    expect(grown).not.toBeNull();
    expect(grown.x + grown.w).toBeLessThan(0.7); // stops far short of the second balloon (which ends at 0.95): it does not swallow it
  });
});

import { splitByBalloon } from './bubbles';

describe('splitByBalloon', () => {
  // 100×100: two white balloons, one above the other, each with a dark outline between them, one line of lettering in each.
  const page = () => {
    const w = 100; const h = 100; const g = new Uint8Array(w * h).fill(40);
    for (let y = 8; y < 42; y++) for (let x = 20; x < 80; x++) g[y * w + x] = 250;
    for (let y = 48; y < 92; y++) for (let x = 20; x < 80; x++) g[y * w + x] = 250; // a dark gap between y 42 and 48 (the outlines)
    for (let y = 20; y < 30; y++) for (let x = 30; x < 70; x += 3) g[y * w + x] = 0;
    for (let y = 62; y < 72; y++) for (let x = 30; x < 70; x += 3) g[y * w + x] = 0;
    return { g, w, h };
  };
  it('puts lines in separate balloons when an outline lies between them', () => {
    const { g, w, h } = page();
    const groups = splitByBalloon(g, w, h, [{ x: 0.3, y: 0.2, w: 0.4, h: 0.1 }, { x: 0.3, y: 0.62, w: 0.4, h: 0.1 }]);
    expect(groups).toHaveLength(2);
  });
  it('keeps lines together when they share one balloon', () => {
    const { g, w, h } = page();
    const groups = splitByBalloon(g, w, h, [{ x: 0.3, y: 0.62, w: 0.4, h: 0.1 }, { x: 0.3, y: 0.78, w: 0.4, h: 0.06 }]);
    expect(groups).toHaveLength(1);
  });
});

import { clipToNeighbours } from './bubbles';

describe('clipToNeighbours', () => {
  it('cuts halfway between two touching balloons, below and above, never into the lettering', () => {
    const upper = { x: 0.6, y: 0.4, w: 0.1, h: 0.03 }; const lower = { x: 0.6, y: 0.5, w: 0.1, h: 0.03 };
    const grownUpper = { x: 0.55, y: 0.36, w: 0.2, h: 0.2 }; // swallows the lower balloon's lettering
    const c = clipToNeighbours(grownUpper, upper, [lower]);
    expect(c.y + c.h).toBeCloseTo((0.43 + 0.5) / 2, 5);
    expect(c.y + c.h).toBeGreaterThanOrEqual(upper.y + upper.h);
    const grownLower = { x: 0.55, y: 0.38, w: 0.2, h: 0.2 };
    const d = clipToNeighbours(grownLower, lower, [upper]);
    expect(d.y).toBeCloseTo((0.43 + 0.5) / 2, 5); expect(d.y).toBeLessThanOrEqual(lower.y);
  });
  it('leaves a box alone when no neighbour lettering is inside it', () => {
    const own = { x: 0.1, y: 0.1, w: 0.1, h: 0.03 }; const g = { x: 0.05, y: 0.07, w: 0.2, h: 0.1 };
    expect(clipToNeighbours(g, own, [{ x: 0.7, y: 0.7, w: 0.1, h: 0.03 }])).toEqual(g);
  });
});
