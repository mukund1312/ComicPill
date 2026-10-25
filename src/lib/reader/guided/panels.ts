// Panel detection for guided view. Works on a small grayscale thumbnail of the page:
//   1. find the gutter colour from the page edges (white, black or whatever the border is),
//   2. XY-cut: split on rows/columns that are almost entirely gutter, recursively,
//   3. keep the leaves as panels, ordered row by row (right-to-left inside a row for manga).
// It cannot split staggered layouts that no straight line separates — those come back as one
// bigger panel, and a page with fewer than two panels falls back to the whole page.
export type Panel = { x: number; y: number; w: number; h: number }; // normalised 0..1

export const FULL_PAGE: Panel = { x: 0, y: 0, w: 1, h: 1 };

type Box = { x0: number; y0: number; x1: number; y1: number }; // x1,y1 exclusive

const TOLERANCE = 24;
const CUT_FRACTION = 0.97;
const MIN_PANEL_AREA = 0.015;
const MAX_DEPTH = 8;

function findGutterGray(gray: Uint8Array, w: number, h: number): number | null {
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.03));
  const edge: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < band || y < band || x >= w - band || y >= h - band) edge.push(gray[y * w + x]);
  const sorted = [...edge].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  let best: { gray: number; frac: number } | null = null;
  for (const candidate of [255, 0, median]) {
    const frac = edge.filter((v) => Math.abs(v - candidate) <= TOLERANCE).length / edge.length;
    if (!best || frac > best.frac + 1e-9) best = { gray: candidate, frac };
  }
  return best && best.frac >= 0.6 ? best.gray : null;
}

/** Contiguous runs of `true`, as [start, endExclusive). */
function runs(flags: boolean[]): Array<[number, number]> {
  const out: Array<[number, number]> = []; let start = -1;
  for (let i = 0; i <= flags.length; i++) {
    if (i < flags.length && flags[i]) { if (start < 0) start = i; }
    else if (start >= 0) { out.push([start, i]); start = -1; }
  }
  return out;
}

export function detectPanels(gray: Uint8Array, w: number, h: number, opts: { rtl?: boolean } = {}): Panel[] {
  if (w < 8 || h < 8 || gray.length < w * h) return [FULL_PAGE];
  const gutter = findGutterGray(gray, w, h);
  if (gutter == null) return [FULL_PAGE];
  const isGutter = (x: number, y: number) => Math.abs(gray[y * w + x] - gutter) <= TOLERANCE;

  let gutterPixels = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isGutter(x, y)) gutterPixels++;
  const gutterShare = gutterPixels / (w * h);
  if (gutterShare < 0.04 || gutterShare > 0.92) return [FULL_PAGE]; // no gutters to cut on, or almost blank

  /** Shrink a box to the bounding box of its non-gutter pixels. */
  const trim = (b: Box): Box | null => {
    let x0 = b.x1, y0 = b.y1, x1 = b.x0, y1 = b.y0;
    for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
      if (!isGutter(x, y)) { if (x < x0) x0 = x; if (x >= x1) x1 = x + 1; if (y < y0) y0 = y; if (y >= y1) y1 = y + 1; }
    }
    return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
  };

  /** Split along one axis on near-pure gutter lines; returns the bands, or null if there is nothing to cut. */
  const split = (b: Box, axis: 'y' | 'x'): Box[] | null => {
    const len = axis === 'y' ? b.y1 - b.y0 : b.x1 - b.x0;
    const across = axis === 'y' ? b.x1 - b.x0 : b.y1 - b.y0;
    const cut: boolean[] = [];
    for (let i = 0; i < len; i++) {
      let g = 0;
      for (let j = 0; j < across; j++) {
        const x = axis === 'y' ? b.x0 + j : b.x0 + i; const y = axis === 'y' ? b.y0 + i : b.y0 + j;
        if (isGutter(x, y)) g++;
      }
      cut.push(g / across >= CUT_FRACTION);
    }
    const minGap = Math.max(1, Math.round(len * 0.004));
    const gaps = runs(cut).filter(([s, e]) => e - s >= minGap);
    if (!gaps.length) return null;
    const bands: Box[] = []; let cursor = 0;
    for (const [s, e] of [...gaps, [len, len] as [number, number]]) {
      if (s > cursor) bands.push(axis === 'y' ? { ...b, y0: b.y0 + cursor, y1: b.y0 + s } : { ...b, x0: b.x0 + cursor, x1: b.x0 + s });
      cursor = e;
    }
    return bands.length >= 2 ? bands : null;
  };

  const cut = (box: Box, depth: number): Box[] => {
    const t = trim(box);
    if (!t) return [];
    if (depth >= MAX_DEPTH) return [t];
    const rows = split(t, 'y');
    if (rows) return rows.flatMap((r) => cut(r, depth + 1));
    const cols = split(t, 'x');
    if (cols) return (opts.rtl ? [...cols].reverse() : cols).flatMap((c) => cut(c, depth + 1));
    return [t];
  };

  const panels = cut({ x0: 0, y0: 0, x1: w, y1: h }, 0)
    .map((b): Panel => ({ x: b.x0 / w, y: b.y0 / h, w: (b.x1 - b.x0) / w, h: (b.y1 - b.y0) / h }))
    .filter((p) => p.w * p.h >= MIN_PANEL_AREA);
  return panels.length >= 2 ? panels : [FULL_PAGE];
}

/** Decode the base64 grayscale payload the native module returns. */
export function decodeBase64(b64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(128); for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = lookup[clean.charCodeAt(i)]; const b = lookup[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? lookup[clean.charCodeAt(i + 2)] : 0; const d = i + 3 < clean.length ? lookup[clean.charCodeAt(i + 3)] : 0;
    if (o < out.length) out[o++] = (a << 2) | (b >> 4);
    if (o < out.length && i + 2 < clean.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (o < out.length && i + 3 < clean.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out;
}
