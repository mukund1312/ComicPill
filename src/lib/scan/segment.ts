// Finding where one book ends and the next begins, from the picture itself rather than from the lettering. The edge between two spines
// is a long, straight, unbroken line of change from top to bottom; lettering and artwork give short, broken ones. Pure arithmetic on a
// grayscale picture (one byte per pixel), so it is the same on every platform and testable on saved photos.

export type Gray = { data: Uint8Array; width: number; height: number };

/** The same picture turned on its side, so books lying flat can be handled by the code written for books standing up. */
export function transpose(g: Gray): Gray {
  const data = new Uint8Array(g.data.length);
  for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) data[x * g.height + y] = g.data[y * g.width + x];
  return { data, width: g.height, height: g.width };
}

/**
 * How strong a line of change each pixel column has over the rows `from`..`to` (fractions of the height): 0 none, 1 unbroken from top to bottom.
 * Spines lean a little in a photo, so each column is also tried along slightly tilted lines and the best is kept. A change counts as an edge when
 * it is strong in absolute terms or strong compared with how bright that spot is, so a dark spine against another dark spine still shows.
 */
export function columnPersistence(g: Gray, from = 0, to = 1): Float32Array {
  const y0 = Math.max(1, Math.floor(from * g.height)); const y1 = Math.min(g.height - 1, Math.ceil(to * g.height));
  const rows = Math.max(1, y1 - y0);
  const sample: number[] = [];
  for (let y = y0; y < y1; y += 3) for (let x = 1; x < g.width - 1; x += 3) sample.push(Math.abs(g.data[y * g.width + x + 1] - g.data[y * g.width + x - 1]));
  sample.sort((a, b) => a - b);
  const absolute = Math.max(14, sample[Math.floor(sample.length * 0.85)] ?? 14);
  // is there an edge at (x, y)? (looking at the pixel's neighbours too, so a pixel of wobble doesn't break a line)
  const edge = new Uint8Array(g.width * g.height);
  for (let y = y0; y < y1; y++) for (let x = 2; x < g.width - 2; x++) {
    const i = y * g.width + x; const left = g.data[i - 1]; const right = g.data[i + 1];
    const d = Math.abs(right - left); const level = Math.max(left, right, 24);
    if (d >= absolute || (d >= 8 && d / level >= 0.2)) edge[i] = 1;
  }
  const out = new Float32Array(g.width);
  const midY = (y0 + y1) / 2;
  for (const tilt of TILTS) {
    for (let x0 = 2; x0 < g.width - 2; x0++) {
      let run = 0; let best = 0; let hits = 0;
      for (let y = y0; y < y1; y++) {
        const x = Math.round(x0 + tilt * (y - midY)); // the column, leaning: it is x0 at the middle of the band
        let on = false;
        if (x >= 2 && x < g.width - 2) { const i = y * g.width + x; on = edge[i] === 1 || edge[i - 1] === 1 || edge[i + 1] === 1; }
        if (on) { hits++; run++; if (run > best) best = run; } else if (run > 0) run = Math.max(0, run - 2); // short gaps don't end a line
      }
      const v = (0.5 * hits + 0.5 * best) / rows; // both how much of the height has the edge and how long the longest unbroken stretch is
      if (v > out[x0]) out[x0] = v;
    }
  }
  return out;
}

/** How far a spine's edge may lean, as pixels sideways per pixel down (about 0 to 3.5 degrees each way). */
const TILTS = [0, -0.03, 0.03, -0.06, 0.06];

/** The columns that look like the edge between two books, as fractions of the width, left to right. */
export function findEdges(persistence: Float32Array, opts: { minStrength?: number; minGap?: number } = {}): number[] {
  const minStrength = opts.minStrength ?? 0.45; const minGap = opts.minGap ?? Math.max(4, Math.round(persistence.length * 0.012));
  const smooth = persistence.map((_, x) => (persistence[Math.max(0, x - 1)] + persistence[x] * 2 + persistence[Math.min(persistence.length - 1, x + 1)]) / 4);
  const peaks: { x: number; v: number }[] = [];
  for (let x = 2; x < smooth.length - 2; x++) if (smooth[x] >= minStrength && smooth[x] >= smooth[x - 1] && smooth[x] >= smooth[x + 1] && smooth[x] > smooth[x - 2] - 1e-6) peaks.push({ x, v: smooth[x] });
  // Within one minimum gap keep the strongest.
  peaks.sort((a, b) => b.v - a.v);
  const kept: { x: number; v: number }[] = [];
  for (const p of peaks) if (!kept.some((k) => Math.abs(k.x - p.x) < minGap)) kept.push(p);
  return kept.sort((a, b) => a.x - b.x).map((p) => p.x / persistence.length);
}

// ---- splitting the shelf into books ----------------------------------------------------------------------------------------------------

/** A text line reduced to what the partition needs: where its centre is along the shelf, and how thick its lettering is (both as fractions). */
export type Mark = { centre: number; size: number };
export type Segment = { from: number; to: number };

/**
 * The best way to cut a shelf into books. Every position along the shelf is a possible cut; a cut is worth making where the picture shows a
 * real edge (and where the lettering has a gap), it is not worth making through the middle of a line of lettering, and each book must be a plausible
 * width. A dynamic programme finds the set of cuts with the best total, so a missing edge is filled in by the lettering and a stray edge inside a
 * book is ignored. `persistence` is the edge strength per pixel column (see `columnPersistence`).
 */
export function partitionShelf(persistence: Float32Array, marks: Mark[], opts: { minWidth?: number; maxWidth?: number; cutCost?: number } = {}): Segment[] {
  const n = persistence.length;
  if (marks.length === 0 || n < 8) return [];
  const sorted = [...marks].sort((a, b) => a.centre - b.centre);
  const typical = [...sorted].map((m) => m.size).sort((a, b) => a - b)[Math.floor(sorted.length / 2)];
  const minWidth = opts.minWidth ?? 0.013; const maxWidth = opts.maxWidth ?? 0.2; const cutCost = opts.cutCost ?? 0.33;
  const at = (x: number) => Math.min(n - 1, Math.max(0, Math.round(x * n)));
  const smooth = Float32Array.from(persistence, (_, x) => (persistence[Math.max(0, x - 1)] + 2 * persistence[x] + persistence[Math.min(n - 1, x + 1)]) / 4);
  // The first and last book start and end at real edges just outside their lettering (a book is wider than its text), if the picture shows one.
  const outer = (centre: number, direction: -1 | 1): number => {
    const near = at(centre + direction * 0.4 * typical); const far = at(centre + direction * Math.max(0.09, 2.2 * typical));
    let bestX = near; let bestV = 0.38;
    for (let x = Math.min(near, far); x <= Math.max(near, far); x++) if (smooth[x] > bestV) { bestV = smooth[x]; bestX = x; }
    return bestV > 0.38 ? bestX : at(centre + direction * (0.5 * typical + 0.004));
  };
  const first = Math.max(0, outer(sorted[0].centre, -1));
  const last = Math.min(n - 1, outer(sorted[sorted.length - 1].centre, 1));

  // Lettering: a cut through the middle of a line is wrong; a cut in a wide empty gap between lines is right.
  const cut = new Float32Array(n); const gap = new Float32Array(n);
  for (const m of sorted) for (let x = at(m.centre - 0.3 * m.size); x <= at(m.centre + 0.3 * m.size); x++) cut[x] = 1;
  const gapWanted = 0.7 * typical; // the same gap the grouping by lettering uses
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1].centre; const b = sorted[i].centre; const g = b - a;
    if (g > gapWanted) { const bonus = Math.min(0.45, 0.2 + 0.25 * (g / (2 * gapWanted))); for (let x = at(a + 0.35 * g); x <= at(b - 0.35 * g); x++) gap[x] = Math.max(gap[x], bonus); }
  }
  // how many line centres lie in [x0, x1): prefix sums
  const count = new Int32Array(n + 1);
  for (const m of sorted) count[Math.min(n - 1, Math.max(0, at(m.centre))) + 1]++;
  for (let x = 0; x < n; x++) count[x + 1] += count[x];
  const textIn = (x0: number, x1: number) => count[x1 + 1] - count[x0]; // centres in columns x0..x1

  const reward = (x: number) => 1.1 * smooth[x] + gap[x] - 1.5 * cut[x] - cutCost; // value of putting a cut at column x
  const minW = Math.max(1, Math.round(minWidth * n)); const maxW = Math.round(maxWidth * n);
  const best = new Float64Array(n).fill(-Infinity); const from = new Int32Array(n).fill(-1);
  best[first] = 0;
  for (let x = first + minW; x <= last; x++) {
    const isEnd = x === last;
    for (let p = Math.max(first, x - maxW); p <= x - minW; p++) {
      if (best[p] === -Infinity) continue;
      const w = (x - p) / n;
      const text = textIn(p, x - 1);
      const widthCost = w < 0.02 ? -0.5 * (0.02 - w) / 0.02 : w > 0.12 ? -1.2 * (w - 0.12) / 0.08 : 0;
      const segment = (text > 0 ? 0.3 : -0.9) + widthCost;
      const v = best[p] + segment + (isEnd ? 0 : reward(x));
      if (v > best[x]) { best[x] = v; from[x] = p; }
    }
  }
  if (best[last] === -Infinity) return [{ from: first / n, to: last / n }];
  const out: Segment[] = [];
  for (let x = last; from[x] >= 0; x = from[x]) out.unshift({ from: from[x] / n, to: x / n });
  return out;
}

/**
 * Where a book's spine starts and ends from top to bottom, from the picture. Books on a shelf differ in height, so each strip is looked at on its
 * own: the top is the strongest horizontal edge just above the lettering (the top of the book), the bottom the strongest just below it (the foot of
 * the book, or the shelf). If no edge stands out, a small margin around the lettering is used. All values are fractions of the picture's height.
 */
export function verticalExtent(g: Gray, from: number, to: number, textTop: number, textBottom: number): { top: number; bottom: number; topFound: boolean; bottomFound: boolean } {
  const x0 = Math.max(1, Math.floor((from + 0.15 * (to - from)) * g.width)); const x1 = Math.min(g.width - 2, Math.ceil((to - 0.15 * (to - from)) * g.width));
  const cols = Math.max(1, x1 - x0);
  const sample: number[] = [];
  for (let y = 1; y < g.height - 1; y += 4) for (let x = x0; x < x1; x += 2) sample.push(Math.abs(g.data[(y + 1) * g.width + x] - g.data[(y - 1) * g.width + x]));
  sample.sort((a, b) => a - b);
  const threshold = Math.max(14, sample[Math.floor(sample.length * 0.8)] ?? 14);
  const rowEdge = (y: number) => { let n = 0; for (let x = x0; x < x1; x++) if (Math.abs(g.data[(y + 1) * g.width + x] - g.data[(y - 1) * g.width + x]) >= threshold) n++; return n / cols; };
  const strongest = (a: number, b: number): { y: number; v: number } => {
    let best = { y: Math.round((a + b) / 2), v: 0 };
    for (let y = Math.max(1, Math.round(a)); y <= Math.min(g.height - 2, Math.round(b)); y++) { const v = (rowEdge(y - 1) + 2 * rowEdge(y) + rowEdge(y + 1)) / 4; if (v > best.v) best = { y, v }; }
    return best;
  };
  const H = g.height;
  const top = strongest((textTop - 0.18) * H, (textTop + 0.004) * H);
  const bottom = strongest((textBottom - 0.004) * H, (textBottom + 0.18) * H);
  const topFound = top.v >= 0.32; const bottomFound = bottom.v >= 0.32;
  return { top: topFound ? top.y / H : Math.max(0, textTop - 0.015), bottom: bottomFound ? bottom.y / H : Math.min(1, textBottom + 0.015), topFound, bottomFound };
}
