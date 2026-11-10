// The camera: where the page has to be moved and how far it has to be scaled for a panel to fill the view. Plain arithmetic in one coordinate
// system (the page's own, 0..1 on each side), so the numbers are the same wherever they are used: moving the camera, cutting the mask's hole,
// and turning a tap back into a place on the page.
import type { Panel } from './panels';

export type Size = { width: number; height: number };
export type Camera = { scale: number; tx: number; ty: number };
export type Rect = { x: number; y: number; w: number; h: number };

/** The page at rest: no zoom, centred. */
export const REST: Camera = { scale: 1, tx: 0, ty: 0 };

export const MAX_SCALE = 6;
/** Share of the view the panel is allowed to fill (the rest is a margin so its border is not clipped). */
export const FILL = 0.96;

/** A panel's bounding box; a polygon panel is bounded by its points. */
export function boundsOf(panel: Panel & { poly?: Array<[number, number]> }): Panel {
  if (!panel.poly || panel.poly.length < 3) return { x: panel.x, y: panel.y, w: panel.w, h: panel.h };
  const xs = panel.poly.map((p) => p[0]); const ys = panel.poly.map((p) => p[1]);
  const x = Math.min(...xs); const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * The camera that centres `panel` and scales it to fill the view without distortion (one scale for both axes).
 * `content` is the size of the page as laid out on screen at rest; the view is the viewport it sits centred in. The result is clamped so the
 * page never slides off its own edge (a panel against the page edge ends up flush with the viewport instead of showing empty space beyond it).
 */
export function cameraFor(panel: Panel, content: Size, view: Size, opts: { fill?: number; maxScale?: number; /** false: centre the panel even where that slides the page past its own edge (fine when a mask hides what is beside it) */ clamp?: boolean } = {}): Camera {
  const fill = opts.fill ?? FILL; const maxScale = opts.maxScale ?? MAX_SCALE;
  const pw = Math.max(1e-6, panel.w * content.width); const ph = Math.max(1e-6, panel.h * content.height);
  const scale = Math.min(maxScale, Math.max(1, Math.min((view.width * fill) / pw, (view.height * fill) / ph)));
  const cx = (panel.x + panel.w / 2 - 0.5) * content.width; const cy = (panel.y + panel.h / 2 - 0.5) * content.height;
  if (opts.clamp === false) return { scale, tx: -cx * scale, ty: -cy * scale };
  const limitX = Math.max(0, (content.width * scale - view.width) / 2); const limitY = Math.max(0, (content.height * scale - view.height) / 2);
  return { scale, tx: Math.min(limitX, Math.max(-limitX, -cx * scale)), ty: Math.min(limitY, Math.max(-limitY, -cy * scale)) };
}

/** Where a page point (0..1) is on screen under a camera. */
export function pageToScreen(cam: Camera, content: Size, view: Size, x: number, y: number): { x: number; y: number } {
  return { x: view.width / 2 + cam.tx + (x - 0.5) * content.width * cam.scale, y: view.height / 2 + cam.ty + (y - 0.5) * content.height * cam.scale };
}

/** The other way: a screen point → a page point (0..1). */
export function screenToPage(cam: Camera, content: Size, view: Size, x: number, y: number): { x: number; y: number } {
  return { x: (x - view.width / 2 - cam.tx) / (cam.scale * content.width) + 0.5, y: (y - view.height / 2 - cam.ty) / (cam.scale * content.height) + 0.5 };
}

/** A panel's box on screen under a camera. */
export function panelOnScreen(cam: Camera, content: Size, view: Size, panel: Panel): Rect {
  const a = pageToScreen(cam, content, view, panel.x, panel.y); const b = pageToScreen(cam, content, view, panel.x + panel.w, panel.y + panel.h);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

/** Is a page point inside a polygon (even-odd rule)? */
export function inPolygon(poly: Array<[number, number]>, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

type Shaped = Panel & { poly?: Array<[number, number]> };

/**
 * The panel under a page point: the smallest one that contains it (so a small inset on top of a big panel wins), or, if the point is in a
 * gutter, the nearest panel within `slack`. -1 when nothing is close.
 */
export function panelAt(panels: Shaped[], x: number, y: number, slack = 0.04): number {
  let best = -1; let bestArea = Infinity;
  panels.forEach((p, i) => {
    const inside = p.poly && p.poly.length >= 3 ? inPolygon(p.poly, x, y) : x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;
    if (inside && p.w * p.h < bestArea) { best = i; bestArea = p.w * p.h; }
  });
  if (best >= 0) return best;
  let nearest = -1; let bestDist = slack;
  panels.forEach((p, i) => {
    const d = p.poly && p.poly.length >= 3 ? distToPolygon(p.poly, x, y) : Math.hypot(Math.max(p.x - x, 0, x - (p.x + p.w)), Math.max(p.y - y, 0, y - (p.y + p.h)));
    if (d < bestDist) { bestDist = d; nearest = i; }
  });
  return nearest;
}

/** Distance from a point to the closest edge of a polygon. */
function distToPolygon(poly: Array<[number, number]>, x: number, y: number): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j]; const [bx, by] = poly[i];
    const dx = bx - ax; const dy = by - ay; const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

/** Which way a tap goes while reading panel by panel: the left 30% steps back and the right 70% forward (mirrored for right-to-left). */
export function tapDirection(x: number, width: number, rtl: boolean, invert = false): -1 | 1 {
  const left = x < width * 0.3;
  const forwardIsRight = !rtl;
  const dir = left ? (forwardIsRight ? -1 : 1) : (forwardIsRight ? 1 : -1);
  return (invert ? -dir : dir) as -1 | 1;
}
