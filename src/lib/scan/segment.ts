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
