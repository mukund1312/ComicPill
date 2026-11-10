// Pop-out geometry: where a lifted balloon starts, where it settles, and the pivot it scales about. Plain arithmetic on rectangles (screen pixels).
export type Rect = { x: number; y: number; w: number; h: number };

export const centreOf = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/**
 * Where the balloon settles: as big as fits the reading area (never more than `maxScale` × its size on the page), at the same aspect ratio,
 * and nudged toward where it came from so it does not leap across the screen over the art.
 */
export const MIN_BUBBLE_SIZE = 0.5; export const MAX_BUBBLE_SIZE = 1.6; export const BUBBLE_SIZE_STEP = 0.15;
export const clampBubbleSize = (v: number) => Math.round(Math.min(MAX_BUBBLE_SIZE, Math.max(MIN_BUBBLE_SIZE, v)) * 100) / 100;

/**
 * Where the balloon ends up. It grows about its own centre, so the enlarged balloon sits right over the original and hides it: it reads as the
 * same balloon coming closer, never as a second copy somewhere else. Only if that would run off the screen is it slid back, by as little as it takes.
 * `size` is the reader's own preference: 1 is the automatic fit, below 1 smaller, above 1 larger (never past the screen).
 */
export function settleRect(from: Rect, view: { width: number; height: number }, opts: { maxScale?: number; fill?: number; size?: number } = {}): Rect {
  const fill = opts.fill ?? 0.72; const maxScale = opts.maxScale ?? 4; const size = opts.size ?? 1;
  const areaW = view.width * fill; const areaH = view.height * 0.55;
  const fit = Math.max(1, Math.min(maxScale, areaW / from.w, areaH / from.h));
  const screenCap = Math.max(1, Math.min((view.width * 0.98) / from.w, (view.height * 0.9) / from.h));
  const s = Math.max(1, Math.min(screenCap, fit * size));
  const w = from.w * s; const h = from.h * s;
  const c = centreOf(from);
  // The enlarged balloon must still cover the original (or it reads as a second copy), so it may only slide as far as keeps `from` inside it.
  // A balloon already hard against an edge keeps that edge as its margin.
  const mx = Math.min(view.width * 0.03, Math.max(0, from.x), Math.max(0, view.width - from.x - from.w));
  const my = Math.min(view.height * 0.04, Math.max(0, from.y), Math.max(0, view.height - from.y - from.h));
  const place = (centre: number, size: number, start: number, length: number, margin: number, limit: number) => {
    const lo = Math.max(margin, start + length - size); const hi = Math.min(limit - size - margin, start);
    const want = centre - size / 2;
    // If it cannot both cover the original and stay on screen (a balloon almost as wide as the screen), staying on screen wins.
    return lo <= hi ? Math.min(hi, Math.max(lo, want)) : Math.min(limit - size, Math.max(0, want));
  };
  const x = place(c.x, w, from.x, from.w, mx, view.width);
  const y = place(c.y, h, from.y, from.h, my, view.height);
  return { x, y, w, h };
}

/**
 * The one point that stays still while the balloon grows from `from` to `to`: scaling about it by s = to.w / from.w carries one rectangle
 * onto the other with no sliding at all. (When the sizes match there is no such point; the centre is used and the caller translates.)
 */
export function pivotFor(from: Rect, to: Rect): { x: number; y: number } {
  const s = to.w / from.w;
  if (Math.abs(s - 1) < 1e-3) return centreOf(from);
  return { x: (to.x - s * from.x) / (1 - s), y: (to.y - s * from.y) / (1 - s) };
}

/** Smooth start and stop. */
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
