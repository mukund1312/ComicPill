import { describe, expect, it } from 'vitest';
import { balloonMask, cropAround } from './mask';
import { centreOf, pivotFor, settleRect } from './pop';

// 100×60 "page": dark art, a white oval balloon with a dark outline and dark lettering, and a small white tail going down-left.
function page() {
  const w = 100; const h = 60; const g = new Uint8Array(w * h).fill(40);
  const inOval = (x: number, y: number, rx: number, ry: number) => ((x - 50) / rx) ** 2 + ((y - 24) / ry) ** 2 <= 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (inOval(x, y, 38, 18)) g[y * w + x] = 20;       // outline
    if (inOval(x, y, 36, 16)) g[y * w + x] = 250;      // inside
  }
  for (let y = 20; y < 28; y++) for (let x = 30; x < 70; x += 4) g[y * w + x] = 0; // lettering strokes
  for (let k = 0; k < 10; k++) for (let x = 34 - k; x < 40 - k; x++) g[(40 + k) * w + x] = 250; // tail
  return { g, w, h };
}

describe('balloonMask', () => {
  it('keeps the balloon (lettering included) and leaves the artwork out', () => {
    const { g, w, h } = page();
    const m = balloonMask(g, w, h)!;
    expect(m).not.toBeNull();
    expect(m.alpha[24 * w + 50]).toBeGreaterThan(200);   // middle of the balloon
    expect(m.alpha[24 * w + 40]).toBeGreaterThan(200);   // on a lettering stroke
    expect(m.alpha[2 * w + 3]).toBeLessThan(20);         // far corner of the art
    expect(m.alpha[56 * w + 90]).toBeLessThan(20);
  });
  it('includes the outline ring', () => {
    const { g, w, h } = page();
    const m = balloonMask(g, w, h)!;
    expect(m.alpha[24 * w + 50 - 37]).toBeGreaterThan(100); // x=13: the dark outline pixel
  });
  it('rejects a patch of shaded artwork that is merely close in tone', () => {
    const w = 100; const h = 60; const g = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = 100 + Math.round(((x * 7 + y * 13) % 60) - 30 + (x / w) * 20); // busy gradient noise
    expect(balloonMask(g, w, h)).toBeNull();
  });
  it('gives up on a plain field', () => {
    expect(balloonMask(new Uint8Array(100 * 60).fill(250), 100, 60)).toBeNull();
  });
  it('opens the crop up without leaving the page', () => {
    const c = cropAround({ x: 0.0, y: 0.5, w: 0.3, h: 0.5 });
    expect(c.x).toBe(0); expect(c.y + c.h).toBeLessThanOrEqual(1); expect(c.w).toBeGreaterThan(0.3);
  });
});

describe('pop geometry', () => {
  it('settles bigger, inside the screen, at the same aspect ratio', () => {
    const from = { x: 100, y: 200, w: 200, h: 80 };
    const to = settleRect(from, { width: 1080, height: 2400 });
    expect(to.w / to.h).toBeCloseTo(from.w / from.h, 5);
    expect(to.w).toBeGreaterThan(from.w);
    expect(to.x).toBeGreaterThanOrEqual(0); expect(to.x + to.w).toBeLessThanOrEqual(1080);
  });
  it('has a pivot that carries the start onto the end by scaling alone', () => {
    const from = { x: 100, y: 200, w: 200, h: 80 };
    const to = settleRect(from, { width: 1080, height: 2400 });
    const p = pivotFor(from, to); const s = to.w / from.w;
    expect(p.x + s * (from.x - p.x)).toBeCloseTo(to.x, 3);
    expect(p.y + s * (from.y - p.y)).toBeCloseTo(to.y, 3);
    expect(p.x + s * (from.x + from.w - p.x)).toBeCloseTo(to.x + to.w, 3);
  });
  it('falls back to the centre when nothing changes size', () => {
    const r = { x: 0, y: 0, w: 100, h: 50 };
    expect(pivotFor(r, { ...r, x: 30 })).toEqual(centreOf(r));
  });
});
