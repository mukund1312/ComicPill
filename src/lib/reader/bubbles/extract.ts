// Extraction, the Skia half: cut a balloon out of the page's own pixels as a transparent image shaped like the balloon.
// The page is read at full resolution; the cut is made from the crop around the balloon, scaled so its longest side is at most MAX_SIDE
// (enough for a balloon filling the screen). The original page image is never touched.
import { AlphaType, ColorType, Skia, type SkImage } from '@shopify/react-native-skia';
import { balloonMask, cropAround } from './mask';
import type { Bubble } from './bubbles';

/** Longest side of the cut-out image: enough for a balloon filling the screen. */
const MAX_SIDE = 1000;
/** The silhouette is worked out on a copy about this many times smaller (the cost grows with the pixel count), then stretched back with a crisp edge. */
const MASK_SHRINK = 3;

export type Extracted = {
  /** The balloon alone, transparent around it. */
  image: SkImage;
  /** Where that image sits on the page, in page fractions (the padded crop). */
  crop: Bubble;
  /** True when a real silhouette was found; false when the whole crop is used, as a plain rounded card. */
  silhouette: boolean;
};

const cuts = new Map<string, Extracted>();
const KEEP_CUTS = 8;
const pages = new Map<string, SkImage>();
const KEEP_PAGES = 2;

async function pageImage(uri: string): Promise<SkImage | null> {
  const hit = pages.get(uri);
  if (hit) { pages.delete(uri); pages.set(uri, hit); return hit; }
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) return null;
  pages.set(uri, image);
  if (pages.size > KEEP_PAGES) pages.delete(pages.keys().next().value as string);
  return image;
}

/** The crop of a page as RGBA pixels, scaled down to at most MAX_SIDE. Null if it can't be read. */
function readCrop(page: SkImage, crop: Bubble): { rgba: Uint8Array; w: number; h: number } | null {
  const sx = crop.x * page.width(); const sy = crop.y * page.height(); const sw = crop.w * page.width(); const sh = crop.h * page.height();
  const k = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k)); const h = Math.max(1, Math.round(sh * k));
  const surface = Skia.Surface.MakeOffscreen(w, h);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  canvas.drawImageRect(page, Skia.XYWHRect(sx, sy, sw, sh), Skia.XYWHRect(0, 0, w, h), paint);
  surface.flush();
  const snap = surface.makeImageSnapshot();
  const px = snap.readPixels(0, 0, { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
  return px instanceof Uint8Array ? { rgba: px, w, h } : null;
}

/**
 * The balloon at `box` on the page at `uri`, as a transparent cut-out. Falls back to the whole crop with rounded corners when no
 * silhouette can be found, so a balloon can always be lifted.
 */
export async function extractBubble(uri: string, box: Bubble): Promise<Extracted | null> {
  const key = `${uri}|${box.x.toFixed(4)},${box.y.toFixed(4)},${box.w.toFixed(4)},${box.h.toFixed(4)}`;
  const hit = cuts.get(key);
  if (hit) return hit;
  const made = await cut(uri, box);
  if (made) { cuts.set(key, made); if (cuts.size > KEEP_CUTS) cuts.delete(cuts.keys().next().value as string); }
  return made;
}

async function cut(uri: string, box: Bubble): Promise<Extracted | null> {
  const page = await pageImage(uri);
  if (!page) return null;
  let crop = cropAround(box);
  let read = readCrop(page, crop);
  if (!read) return null;
  let found = findSilhouette(read.rgba, read.w, read.h);
  if (!found && box.tight) {
    // No balloon outline here (lettering on artwork, a logo): lift just the lettering as a small card, not the big area around it.
    crop = cropAround(box.tight);
    const tight = readCrop(page, crop);
    if (tight) { read = tight; found = null; }
  }
  const { rgba, w, h } = read;
  // Where the detected balloon sits inside the crop: nothing outside it (plus a hair) may be part of this cut-out, whatever touches it.
  const win = { x0: (box.x - crop.x) / crop.w, y0: (box.y - crop.y) / crop.h, x1: (box.x + box.w - crop.x) / crop.w, y1: (box.y + box.h - crop.y) / crop.h };
  return build(rgba, w, h, found, crop, win);
}

type Silhouette = { alpha: Uint8Array; sw: number; sh: number };

/** The balloon's silhouette on a small grayscale copy of the crop, or null when the fill leaks. */
function findSilhouette(rgba: Uint8Array, w: number, h: number): Silhouette | null {
  const sw = Math.max(1, Math.floor(w / MASK_SHRINK)); const sh = Math.max(1, Math.floor(h / MASK_SHRINK));
  const small = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    // The darkest pixel of each block, not the average: an outline a pixel or two thick must stay an outline after shrinking, or the fill
    // would walk across it from one balloon into the next.
    let darkest = 255;
    for (let dy = 0; dy < MASK_SHRINK; dy++) for (let dx = 0; dx < MASK_SHRINK; dx++) {
      const i = ((y * MASK_SHRINK + dy) * w + (x * MASK_SHRINK + dx)) * 4;
      const g = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
      if (g < darkest) darkest = g;
    }
    small[y * sw + x] = darkest;
  }
  const mask = balloonMask(small, sw, sh, 1);
  return mask ? { alpha: mask.alpha, sw, sh } : null;
}

/** Width of the ink line drawn around a silhouette, in cut-out pixels: the clean, printed edge a lifted balloon wears. */
const RIM_PX = 2.4;
/** How much the lettering is sharpened (an unsharp mask on the cut-out), so it stays crisp when the balloon is enlarged. */
const SHARPEN = 0.45;

function build(rgba: Uint8Array, w: number, h: number, mask: Silhouette | null, crop: Bubble, win?: { x0: number; y0: number; x1: number; y1: number }): Extracted | null {
  const padX = 0.006; const padY = 0.008;
  const wx0 = win ? Math.max(0, win.x0 - padX) * w : 0; const wx1 = win ? Math.min(1, win.x1 + padX) * w : w;
  const wy0 = win ? Math.max(0, win.y0 - padY) * h : 0; const wy1 = win ? Math.min(1, win.y1 + padY) * h : h;

  // 1. The shape: the silhouette stretched back to full size with a crisp edge (or a rounded card when there is none).
  const alpha = new Float32Array(w * h);
  const sh = mask ? mask.sh : 1; const sw = mask ? mask.sw : 1;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) / MASK_SHRINK - 0.5)); const y0 = Math.floor(fy); const y1 = Math.min(sh - 1, y0 + 1); const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      let a: number;
      if (mask) {
        const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) / MASK_SHRINK - 0.5)); const x0 = Math.floor(fx); const x1 = Math.min(sw - 1, x0 + 1); const tx = fx - x0;
        const m = mask.alpha;
        const v = (m[y0 * sw + x0] * (1 - tx) + m[y0 * sw + x1] * tx) * (1 - ty) + (m[y1 * sw + x0] * (1 - tx) + m[y1 * sw + x1] * tx) * ty;
        a = Math.max(0, Math.min(255, (v - 128) * 3 + 128)); // steepen the soft upsampled edge so it is crisp but not stair-stepped
      } else a = roundedAlpha(x - wx0, y - wy0, wx1 - wx0, wy1 - wy0);
      if (x < wx0 || x >= wx1 || y < wy0 || y >= wy1) a = 0;
      alpha[y * w + x] = a / 255;
    }
  }

  // 2. The ink rim: how far outside the shape each pixel is, within RIM_PX (a small distance pass), so the line has a smooth, even width.
  const rim = mask ? rimAlpha(alpha, w, h, RIM_PX) : null;

  // 3. Lettering sharpened (unsharp mask against a 3×3 blur), only inside the shape.
  const out = new Uint8Array(w * h * 4);
  const INK = 14; // the outline's colour: near-black, like printed ink
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x; const i = k * 4;
    const a = alpha[k];
    let r = rgba[i]; let g = rgba[i + 1]; let b = rgba[i + 2];
    if (a > 0 && x > 0 && y > 0 && x < w - 1 && y < h - 1) {
      let br = 0; let bg = 0; let bb = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = ((y + dy) * w + (x + dx)) * 4; br += rgba[j]; bg += rgba[j + 1]; bb += rgba[j + 2]; }
      r = clamp(r + (r - br / 9) * SHARPEN); g = clamp(g + (g - bg / 9) * SHARPEN); b = clamp(b + (b - bb / 9) * SHARPEN);
    }
    // Composite: the balloon over its ink rim (premultiplied).
    const ra = rim ? rim[k] * (1 - a) : 0;
    const A = a + ra;
    out[i] = Math.round((r * a + INK * ra)); out[i + 1] = Math.round((g * a + INK * ra)); out[i + 2] = Math.round((b * a + INK * ra)); out[i + 3] = Math.round(A * 255);
  }
  const image = Skia.Image.MakeImage({ width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Premul }, Skia.Data.fromBytes(out), w * 4);
  return image ? { image, crop, silhouette: !!mask } : null;
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * The outline band around a shape: 1 within `r` pixels outside it, fading over the last pixel, 0 beyond. A two-pass chamfer distance
 * (3-4 weights) from the shape's solid part is close enough to a true circle for a line this thin.
 */
function rimAlpha(alpha: Float32Array, w: number, h: number, r: number): Float32Array {
  const BIG = 1e6; const d = new Float32Array(w * h);
  for (let k = 0; k < d.length; k++) d[k] = alpha[k] >= 0.5 ? 0 : BIG;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x; let v = d[k];
    if (x > 0) v = Math.min(v, d[k - 1] + 3);
    if (y > 0) { v = Math.min(v, d[k - w] + 3); if (x > 0) v = Math.min(v, d[k - w - 1] + 4); if (x < w - 1) v = Math.min(v, d[k - w + 1] + 4); }
    d[k] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const k = y * w + x; let v = d[k];
    if (x < w - 1) v = Math.min(v, d[k + 1] + 3);
    if (y < h - 1) { v = Math.min(v, d[k + w] + 3); if (x < w - 1) v = Math.min(v, d[k + w + 1] + 4); if (x > 0) v = Math.min(v, d[k + w - 1] + 4); }
    d[k] = v;
  }
  const out = new Float32Array(w * h);
  for (let k = 0; k < out.length; k++) { const dist = d[k] / 3; out[k] = dist <= r ? 1 : dist >= r + 1 ? 0 : r + 1 - dist; }
  return out;
}

/** A rounded-rectangle alpha for when no silhouette is found. */
function roundedAlpha(x: number, y: number, w: number, h: number): number {
  const r = Math.min(w, h) * 0.08;
  const dx = Math.max(r - x, 0, x - (w - 1 - r)); const dy = Math.max(r - y, 0, y - (h - 1 - r));
  const d = Math.sqrt(dx * dx + dy * dy);
  return d <= r - 1 ? 255 : d >= r ? 0 : Math.round(255 * (r - d));
}
