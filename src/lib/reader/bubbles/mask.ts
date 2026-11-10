// Extraction: the balloon's real silhouette as an alpha mask, found from the page pixels themselves.
// A balloon is a patch of one even shade (usually white) with lettering on it, closed by a dark outline, plus a tail. Starting from the middle of
// the detected box, spread over everything of about that shade; fill the holes the lettering leaves; widen a little to take in the outline;
// then soften the edge. Returns null when the spread leaks into the artwork (a caption with no outline, lettering straight on the art).
import type { Bubble } from './bubbles';

export type Mask = { width: number; height: number; alpha: Uint8Array };

const SHADE_TOLERANCE = 38;
/** Share of the box the filled area may cover before it is judged to have leaked out. */
const LEAK_FRACTION = 0.8;
/** How much the fill's shade may vary (standard deviation, 0–255) and still count as one flat balloon colour. */
const FLAT_STD = 13;
/** Share of the crop's border the fill may touch. */
const EDGE_FILLED = 0.2;

/**
 * `gray` is the cropped balloon area (w×h, one byte a pixel). The balloon is assumed to sit in the middle of it: seeds come from the centre
 * half of the crop, and the fill may not leave the crop.
 */
export function balloonMask(gray: Uint8Array, w: number, h: number, outlinePx = 3): Mask | null {
  const sx0 = Math.floor(w * 0.25); const sx1 = Math.ceil(w * 0.75); const sy0 = Math.floor(h * 0.25); const sy1 = Math.ceil(h * 0.75);
  // The balloon's shade: the lightest common one in the centre (lettering is dark, so it is never the most common).
  const hist = new Uint32Array(64);
  for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) hist[gray[y * w + x] >> 2]++;
  // The paper is the lightest shade there is a good amount of in the middle (not simply the commonest: a balloon over a big patch of coloured art
  // would otherwise be mistaken for the art), and lettering is dark so it is never the lightest.
  const centre = (sx1 - sx0) * (sy1 - sy0);
  let bin = 0; for (let v = 0; v < 64; v++) if (hist[v] > hist[bin] || (hist[v] === hist[bin] && v > bin)) bin = v;
  for (let v = 63; v > bin; v--) if (hist[v] >= centre * 0.1) { bin = v; break; }
  const shade = bin * 4 + 2;
  const near = (v: number) => Math.abs(v - shade) <= SHADE_TOLERANCE;

  const filled = new Uint8Array(w * h); const stack: number[] = [];
  for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) { const i = y * w + x; if (near(gray[i])) { filled[i] = 1; stack.push(i); } }
  if (stack.length === 0) return null;
  let count = 0;
  while (stack.length) {
    const i = stack.pop() as number; const x = i % w; const y = (i - x) / w;
    count++;
    if (x > 0 && !filled[i - 1] && near(gray[i - 1])) { filled[i - 1] = 1; stack.push(i - 1); }
    if (x < w - 1 && !filled[i + 1] && near(gray[i + 1])) { filled[i + 1] = 1; stack.push(i + 1); }
    if (y > 0 && !filled[i - w] && near(gray[i - w])) { filled[i - w] = 1; stack.push(i - w); }
    if (y < h - 1 && !filled[i + w] && near(gray[i + w])) { filled[i + w] = 1; stack.push(i + w); }
  }
  if (count > w * h * LEAK_FRACTION || count < w * h * 0.04) return null;
  if (!looksLikeBalloon(gray, filled, w, h)) return null;

  // Holes: anything the outside cannot reach without crossing the filled area is inside the balloon (the lettering).
  const outside = new Uint8Array(w * h); const q: number[] = [];
  const seed = (i: number) => { if (!filled[i] && !outside[i]) { outside[i] = 1; q.push(i); } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (q.length) {
    const i = q.pop() as number; const x = i % w; const y = (i - x) / w;
    if (x > 0) seed(i - 1); if (x < w - 1) seed(i + 1); if (y > 0) seed(i - w); if (y < h - 1) seed(i + w);
  }
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < solid.length; i++) solid[i] = outside[i] ? 0 : 1;

  return { width: w, height: h, alpha: soften(grow(solid, w, h, outlinePx), w, h) };
}

/**
 * A balloon's fill is one flat shade, and it stays inside its own crop. A fill that varies (a patch of shaded artwork that happened to be
 * within the tolerance) or that runs off the crop edge is not a balloon.
 */
function looksLikeBalloon(gray: Uint8Array, filled: Uint8Array, w: number, h: number): boolean {
  let n = 0; let sum = 0; let sq = 0;
  for (let i = 0; i < filled.length; i++) if (filled[i]) { n++; const v = gray[i]; sum += v; sq += v * v; }
  if (n === 0) return false;
  const mean = sum / n; const std = Math.sqrt(Math.max(0, sq / n - mean * mean));
  if (std > FLAT_STD) return false;
  let edge = 0; let edgeFilled = 0;
  for (let x = 0; x < w; x++) { edge += 2; edgeFilled += filled[x] + filled[(h - 1) * w + x]; }
  for (let y = 1; y < h - 1; y++) { edge += 2; edgeFilled += filled[y * w] + filled[y * w + w - 1]; }
  return edgeFilled / edge <= EDGE_FILLED;
}

/** Widen the silhouette by `r` pixels (a square window, done as two passes) so the dark outline is inside it. */
function grow(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const pass = new Uint8Array(w * h); const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let run = 0; // pixels left until a set pixel stops reaching
    for (let x = -r; x < w; x++) {
      if (x + r < w && src[y * w + x + r]) run = 2 * r + 1;
      if (x >= 0) { pass[y * w + x] = run > 0 ? 1 : 0; }
      if (run > 0) run--;
    }
  }
  for (let x = 0; x < w; x++) {
    let run = 0;
    for (let y = -r; y < h; y++) {
      if (y + r < h && pass[(y + r) * w + x]) run = 2 * r + 1;
      if (y >= 0) out[y * w + x] = run > 0 ? 255 : 0;
      if (run > 0) run--;
    }
  }
  return out;
}

/** One 3×3 average, so the cut-out edge is not stair-stepped. */
function soften(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sum = 0; let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx; const yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) { sum += src[yy * w + xx]; n++; }
    }
    out[y * w + x] = Math.round(sum / n);
  }
  return out;
}

/** Where the balloon crop sits on the page, in page fractions: the detected box opened up a little so the outline and tail tip are inside. */
export function cropAround(box: Bubble): Bubble {
  // Room for the outline and the tail to sit inside the crop with paper-free art around it, so the silhouette finder can see where the balloon ends.
  const px = box.w * 0.16 + 0.008; const py = box.h * 0.22 + 0.008;
  const x = Math.max(0, box.x - px); const y = Math.max(0, box.y - py);
  return { x, y, w: Math.min(1, box.x + box.w + px) - x, h: Math.min(1, box.y + box.h + py) - y };
}
