import { describe, expect, it } from 'vitest';
import { cameraFor, inPolygon, MAX_SCALE, REST, pageToScreen, panelAt, panelOnScreen, screenToPage, tapDirection } from './camera';

const content = { width: 400, height: 600 }; const view = { width: 400, height: 800 };

describe('cameraFor', () => {
  it('centres the panel and fills the view without distortion', () => {
    const panel = { x: 0.25, y: 0.25, w: 0.5, h: 0.25 };
    const cam = cameraFor(panel, content, view);
    const r = panelOnScreen(cam, content, view, panel);
    expect(r.x + r.w / 2).toBeCloseTo(view.width / 2, 3);
    expect(r.y + r.h / 2).toBeCloseTo(view.height / 2, 3);
    expect(r.w / r.h).toBeCloseTo((panel.w * content.width) / (panel.h * content.height), 5); // same shape: one scale for both axes
    expect(r.w).toBeLessThanOrEqual(view.width * 0.96 + 1e-6); expect(r.h).toBeLessThanOrEqual(view.height * 0.96 + 1e-6);
    expect(Math.max(r.w / view.width, r.h / view.height)).toBeCloseTo(0.96, 3); // it fills in the limiting direction
  });
  it('never zooms out below the page, nor past the maximum', () => {
    expect(cameraFor({ x: 0, y: 0, w: 1, h: 1 }, content, view).scale).toBe(1);
    expect(cameraFor({ x: 0.4, y: 0.4, w: 0.001, h: 0.001 }, content, view).scale).toBe(MAX_SCALE);
  });
  it('keeps the page from sliding off its own edge', () => {
    const cam = cameraFor({ x: 0, y: 0, w: 0.4, h: 0.2 }, content, view); // a panel hard against the top-left corner
    const tl = pageToScreen(cam, content, view, 0, 0);
    expect(tl.x).toBeLessThanOrEqual(1e-6); // the page edge is at or beyond the viewport edge, never inside it
    expect(tl.y).toBeLessThanOrEqual(view.height / 2 - (content.height * cam.scale) / 2 + (content.height * cam.scale - view.height) / 2 + 1e-6);
  });
  it('can centre a corner panel exactly when asked not to clamp', () => {
    const panel = { x: 0, y: 0, w: 0.4, h: 0.2 };
    const cam = cameraFor(panel, content, view, { clamp: false });
    const r = panelOnScreen(cam, content, view, panel);
    expect(r.x + r.w / 2).toBeCloseTo(view.width / 2, 3); expect(r.y + r.h / 2).toBeCloseTo(view.height / 2, 3);
  });
  it('rests at the identity', () => {
    expect(REST).toEqual({ scale: 1, tx: 0, ty: 0 });
  });
});

describe('coordinates', () => {
  it('round-trips a point through screen and back, at any camera', () => {
    const cam = cameraFor({ x: 0.1, y: 0.5, w: 0.5, h: 0.3 }, content, view);
    const s = pageToScreen(cam, content, view, 0.33, 0.62); const p = screenToPage(cam, content, view, s.x, s.y);
    expect(p.x).toBeCloseTo(0.33, 6); expect(p.y).toBeCloseTo(0.62, 6);
  });
});

describe('panelAt', () => {
  const panels = [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0.6, y: 0.1, w: 0.3, h: 0.2 }, { x: 0, y: 0.55, w: 0.5, h: 0.45 }];
  it('prefers the smallest panel containing the point (an inset over its big neighbour)', () => {
    expect(panelAt(panels, 0.7, 0.2)).toBe(1);
    expect(panelAt(panels, 0.2, 0.2)).toBe(0);
  });
  it('snaps a gutter tap to the nearest panel, and ignores empty space', () => {
    expect(panelAt(panels, 0.25, 0.52)).toBeGreaterThanOrEqual(0);
    expect(panelAt(panels, 0.9, 0.9)).toBe(-1);
  });
  it('honours polygon outlines', () => {
    const tri = { x: 0, y: 0, w: 1, h: 1, poly: [[0, 0], [1, 0], [0, 1]] as Array<[number, number]> };
    expect(inPolygon(tri.poly, 0.2, 0.2)).toBe(true); expect(inPolygon(tri.poly, 0.9, 0.9)).toBe(false);
    expect(panelAt([tri], 0.2, 0.2)).toBe(0);
    expect(panelAt([tri], 0.9, 0.9, 0.001)).toBe(-1);
  });
});

describe('tapDirection', () => {
  it('goes back on the left 30% and forward on the right 70%, mirrored for manga', () => {
    expect(tapDirection(50, 400, false)).toBe(-1); expect(tapDirection(300, 400, false)).toBe(1);
    expect(tapDirection(50, 400, true)).toBe(1); expect(tapDirection(300, 400, true)).toBe(-1);
    expect(tapDirection(50, 400, false, true)).toBe(1);
  });
});
