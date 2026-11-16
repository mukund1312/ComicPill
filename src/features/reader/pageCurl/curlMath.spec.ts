import { describe, expect, it } from 'vitest';
import { bendAt, curlGeometry, endLift, foldAngle, releaseTarget, rollAt, spreadGeometry, stiff, type CurlPose } from './curlMath';

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
  it('turning back, the held corner comes over first: the tilt is mirrored', () => {
    expect(foldAngle(0.7, W, { ...at(0.02), back: true })).toBeGreaterThan(0);
    expect(foldAngle(0.7, W, { ...at(0.98), back: true })).toBeLessThan(0);
    expect(Math.abs(foldAngle(0.7, W, { ...at(0.5), back: true }))).toBeLessThan(1e-9);
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

/** Strips along the fold, from one end of the page to the other. */
const strips = (p: CurlPose) => [-1, -0.5, 0, 0.5, 1].map((k) => k * p.H / 2);

describe('single-page curl geometry', () => {
  for (const y of [0.02, 0.5, 0.98]) {
    it(`starts flat and ends fully over, every strip (grab at ${y})`, () => {
      const g0 = curlGeometry(0, W, H, at(y));
      for (const v of strips(g0)) expect(Math.abs(rollAt(g0, v).a - sMax(g0.phi))).toBeLessThan(1);
      const g1 = curlGeometry(1, W, H, at(y));
      for (const v of strips(g1)) { const r = rollAt(g1, v); expect(r.a + r.R).toBeLessThanOrEqual(sMin(g1.phi) + 1e-6); }
    });
    it(`moves continuously (grab at ${y})`, () => {
      let prev = curlGeometry(0, W, H, at(y));
      for (let i = 1; i <= 200; i++) {
        const g = curlGeometry(i / 200, W, H, at(y, 40 * Math.sin(i / 30)));
        for (const v of [0, H / 3]) expect(Math.abs(rollAt(g, v).a - rollAt(prev, v).a)).toBeLessThan(W * 0.05);
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
      // A sheet point at s' that has come over lies at 2·A0 − s', whatever its strip's radius.
      expect(Math.abs(2 * g.A0 - sG - sF)).toBeLessThan(0.08 * W);
      // And the held point really is over the top of its strip's roll (flat on the far side), not part-way round it.
      const r = rollAt(g, g.vG);
      expect(sG - r.a).toBeGreaterThanOrEqual(Math.PI * r.R - 1e-6);
    });
  }
  it('the sheet bends freely: tight by the finger, looser along the fold away from it', () => {
    const g = curlGeometry(0.5, W, H, at(0.1, 0, 1));
    const near = rollAt(g, g.vG).R; const far = rollAt(g, g.vG + 0.9 * H).R;
    expect(near).toBeLessThan(far);
    expect(bendAt(0, 0, H)).toBeCloseTo(0.6);
    expect(bendAt(H, 0, H)).toBeCloseTo(1.4);
  });
  it('a hold far in from the edge cannot fold the whole page over at once', () => {
    const g = curlGeometry(0.02, W, H, at(0.5, 0, 0.1));
    expect(rollAt(g, 0).a).toBeGreaterThan(0.45 * W);
  });
});

describe('spread curl geometry', () => {
  const S = 300; const E = 700; const P = E - S; const PH = 500; const SW = 1000;
  const sp = (y: number, dy = 0, x = 1) => ({ x, y, dy, span: SW });
  it('lands mirrored about the spine with an upright fold', () => {
    const g = spreadGeometry(1, S, E, PH, sp(0.1, 80));
    expect(Math.abs(g.phi)).toBeLessThan(1e-9);
    expect(g.A0).toBe(0);
  });
  it('starts flat', () => {
    const g = spreadGeometry(0, S, E, PH, sp(0.3));
    expect(Math.abs(rollAt(g, 0).a - (P * Math.cos(g.phi) + (PH / 2) * Math.abs(Math.sin(g.phi))))).toBeLessThan(1);
  });
  it('leans towards the held corner', () => {
    expect(spreadGeometry(0.2, S, E, PH, sp(0.0)).phi).toBeLessThan(0);
    expect(spreadGeometry(0.2, S, E, PH, sp(1.0)).phi).toBeGreaterThan(0);
  });
  for (const [x, y] of [[1, 0.5], [0.8, 0.15]]) {
    it(`keeps the touched point under the finger (held at ${x}, ${y})`, () => {
      const t = 0.35; const g = spreadGeometry(t, S, E, PH, sp(y, 0, x));
      const d = [Math.cos(g.phi), Math.sin(g.phi)];
      const G = [x * P, (y - 0.5) * PH]; const F = [G[0] - t * SW, G[1]];
      const sG = G[0] * d[0] + G[1] * d[1]; const sF = F[0] * d[0] + F[1] * d[1];
      expect(Math.abs(2 * g.A0 - sG - sF)).toBeLessThan(0.1 * P);
    });
  }
});

describe('resistance', () => {
  it('a pull past the end lifts the last page less and less, never more than a fifth of a turn', () => {
    expect(endLift(-10, 400)).toBe(0);
    expect(endLift(50, 400)).toBeGreaterThan(0);
    expect(endLift(400, 400) - endLift(200, 400)).toBeLessThan(endLift(200, 400));
    expect(endLift(1e6, 400)).toBeLessThanOrEqual(0.2);
  });
  it('the paper gives a little at first, then follows the finger 1:1', () => {
    expect(stiff(0, 10)).toBe(0);
    expect(Math.abs(stiff(3, 10))).toBeLessThan(1);
    expect(stiff(200, 10)).toBeCloseTo(190, 0);
    expect(stiff(-200, 10)).toBeCloseTo(-190, 0);
    for (let x = -100; x < 100; x += 1) expect(stiff(x + 1, 10)).toBeGreaterThanOrEqual(stiff(x, 10));
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
