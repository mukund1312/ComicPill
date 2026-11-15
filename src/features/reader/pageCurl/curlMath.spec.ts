import { describe, expect, it } from 'vitest';
import { curlGeometry, foldAngle, releaseTarget, spreadGeometry } from './curlMath';

const W = 400; const H = 600; const SPAN = 412;
const at = (y: number, dy = 0, x = 1) => ({ x, y, dy, span: SPAN });
/** The page's leading extent along the fold normal (measured from the middle of its left edge). */
const sMax = (phi: number) => W * Math.cos(phi) + (H / 2) * Math.abs(Math.sin(phi));
const sMin = (phi: number) => -(H / 2) * Math.abs(Math.sin(phi));

describe('fold direction follows the grab', () => {
  it('a hold near the top corner lifts the top corner first', () => {
    // d = (cos φ, sin φ): negative φ points up-right, so the top-right corner is the furthest point along the fold normal.
    expect(foldAngle(0.1, W, at(0.02))).toBeLessThan(-0.2);
  });
  it('a hold near the bottom corner lifts the bottom corner first', () => {
    expect(foldAngle(0.1, W, at(0.98))).toBeGreaterThan(0.2);
  });
  it('a hold in the middle of the edge lifts the whole edge evenly', () => {
    expect(Math.abs(foldAngle(0.1, W, at(0.5)))).toBeLessThan(1e-9);
  });
  it('the fold follows the finger: dragging down from the top tilts it further, dragging up from the bottom too', () => {
    expect(foldAngle(0.3, W, at(0.02, 120))).toBeLessThan(foldAngle(0.3, W, at(0.02, 0)));
    expect(foldAngle(0.3, W, at(0.98, -120))).toBeGreaterThan(foldAngle(0.3, W, at(0.98, 0)));
    // From the middle, the finger alone decides which way it leans.
    expect(foldAngle(0.3, W, at(0.5, 150))).toBeLessThan(0);
    expect(foldAngle(0.3, W, at(0.5, -150))).toBeGreaterThan(0);
  });
  it('stays bounded even for a wild drag, and is square once the page is over', () => {
    for (const dy of [-5000, -300, 0, 300, 5000]) for (const y of [-1, 0, 0.5, 1, 2]) {
      expect(Math.abs(foldAngle(0.01, W, at(y, dy)))).toBeLessThanOrEqual(0.85);
      expect(Math.abs(foldAngle(1, W, at(y, dy)))).toBeLessThan(1e-9);
    }
  });
  it('a tiny drag does not swing the fold (no jump on touch)', () => {
    expect(Math.abs(foldAngle(0.005, W, at(0.5, 4)))).toBeLessThan(0.03);
  });
});

describe('single-page curl geometry', () => {
  for (const y of [0.02, 0.5, 0.98]) {
    it(`starts flat and ends fully over (grab at ${y})`, () => {
      const g0 = curlGeometry(0, W, H, at(y));
      // Nothing of the page is past the roll at the start: the axis sits on the leading corner.
      expect(Math.abs(g0.a - sMax(g0.phi))).toBeLessThan(1);
      const g1 = curlGeometry(1, W, H, at(y));
      // At the end the roll has passed the trailing corner, so no part of the sheet is left on the page.
      expect(g1.a + g1.R).toBeLessThanOrEqual(sMin(g1.phi) + 1e-6);
    });
    it(`moves continuously and only forwards (grab at ${y})`, () => {
      let prev = curlGeometry(0, W, H, at(y));
      for (let i = 1; i <= 200; i++) {
        const g = curlGeometry(i / 200, W, H, at(y, 40 * Math.sin(i / 30)));
        expect(Math.abs(g.a - prev.a)).toBeLessThan(W * 0.04);
        expect(Math.abs(g.phi - prev.phi)).toBeLessThan(0.05);
        prev = g;
      }
    });
  }
  for (const [x, y, dy] of [[1, 0.5, 0], [0.8, 0.1, 150], [0.9, 0.9, -120], [0.7, 0.5, 60]]) {
    it(`the point that was touched stays under the finger (held at ${x}, ${y}, dragged ${dy} down)`, () => {
      const t = 0.3; const g = curlGeometry(t, W, H, at(y, dy, x));
      const d = [Math.cos(g.phi), Math.sin(g.phi)];
      const G = [x * W, (y - 0.5) * H]; const F = [G[0] - t * SPAN, G[1] + dy];
      const sG = G[0] * d[0] + G[1] * d[1]; const sF = F[0] * d[0] + F[1] * d[1];
      // Once it is over the roll, a sheet point at s' shows at 2a + πR − s'.
      expect(Math.abs(2 * g.a + Math.PI * g.R - sG - sF)).toBeLessThan(0.08 * W);
    });
  }
  it('a hold far in from the edge cannot fold the whole page over at once', () => {
    const g = curlGeometry(0.02, W, H, at(0.5, 0, 0.1));
    expect(g.a).toBeGreaterThan(0.45 * W);
  });
});

describe('spread curl geometry', () => {
  it('lands mirrored about the spine with an upright fold', () => {
    const g = spreadGeometry(1, 300, 700, 500, at(0.1, 80));
    expect(Math.abs(g.phi)).toBeLessThan(1e-9);
    expect(2 * g.a + Math.PI * g.R).toBeCloseTo(0, 6);
  });
  it('leans towards the held corner', () => {
    expect(spreadGeometry(0.2, 300, 700, 500, at(0.0)).phi).toBeLessThan(0);
    expect(spreadGeometry(0.2, 300, 700, 500, at(1.0)).phi).toBeGreaterThan(0);
  });
});

describe('release', () => {
  const w = 400; const last = 9;
  it('a slow, short drag falls back', () => expect(releaseTarget(3 * w + 60, 3, -50, w, last)).toBe(3));
  it('a long slow drag completes', () => expect(releaseTarget(3 * w + 260, 3, -20, w, last)).toBe(4));
  it('a quick flick completes a turn that has barely started', () => expect(releaseTarget(3 * w + 30, 3, -1800, w, last)).toBe(4));
  it('a quick flick back turns to the previous page', () => expect(releaseTarget(3 * w - 30, 3, 1800, w, last)).toBe(2));
  it('dragging half-way and reversing returns', () => expect(releaseTarget(3 * w + 220, 3, 900, w, last)).toBe(3));
  it('never skips more than one page, and stays inside the book', () => {
    expect(releaseTarget(3 * w + 380, 3, -9000, w, last)).toBe(4);
    expect(releaseTarget(0, 0, 3000, w, last)).toBe(0);
    expect(releaseTarget(last * w, last, -3000, w, last)).toBe(last);
  });
});
