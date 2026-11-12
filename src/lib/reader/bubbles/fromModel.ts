// Turning the neural detector's boxes into zoom targets. The detector draws the balloon itself (not just its lettering), so no outline hunting is
// needed here: drop weak or duplicate boxes, keep a hair of air around each, and put them in reading order.
import { orderBlocks, type OcrLine } from '../ocr/layout';
import { clipToNeighbours, type Bubble } from './bubbles';

export type Detection = { c: number; s: number; x: number; y: number; w: number; h: number };

const MIN_SCORE = 0.4;
/** Sound effects are judged more strictly: a stray word of background text is worse than a missed one. */
const SFX_SCORE = 0.55;
const MAX_SHARE = 0.25;

const overlap = (a: Bubble, b: Bubble) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x); const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? (w * h) / Math.min(a.w * a.h, b.w * b.h) : 0;
};

/**
 * The detector sometimes draws one box around two balloons stacked on each other. The text boxes (class 1) inside a balloon box tell them apart:
 * if they fall into separate vertical groups with a clear gap, the box is cut at the middle of each gap, into one box per group.
 */
export function splitStacked(balloon: Detection, texts: Detection[]): Detection[] {
  const inside = texts
    .filter((t) => t.c === 1 && t.x + t.w / 2 >= balloon.x && t.x + t.w / 2 <= balloon.x + balloon.w && t.y + t.h / 2 >= balloon.y && t.y + t.h / 2 <= balloon.y + balloon.h)
    .sort((a, b) => a.y - b.y);
  if (inside.length < 2) return [balloon];
  const groups: Detection[][] = [[inside[0]]];
  for (let i = 1; i < inside.length; i++) {
    const prev = groups[groups.length - 1]; const last = prev[prev.length - 1];
    const gap = inside[i].y - (last.y + last.h);
    const ref = Math.min(last.h, inside[i].h);
    // A real break between balloons is a gap at least as tall as a line of lettering; between lines of one balloon it is small.
    if (gap > ref * 0.5 && inside[i].y > last.y + last.h) groups.push([inside[i]]); else prev.push(inside[i]);
  }
  if (groups.length < 2) return [balloon];
  const cuts = groups.slice(0, -1).map((g, i) => { const lo = Math.max(...g.map((t) => t.y + t.h)); const hi = Math.min(...groups[i + 1].map((t) => t.y)); return (lo + hi) / 2; });
  const edges = [balloon.y, ...cuts, balloon.y + balloon.h];
  return groups.map((_, i) => ({ ...balloon, y: edges[i], h: edges[i + 1] - edges[i] }));
}

export function bubblesFromDetections(dets: Detection[], rtl: boolean): Bubble[] {
  // Class 0 is the balloon (captions included). Lettering outside a balloon (class 2: sound effects, signs) is kept too, marked `sfx`, so the
  // reader can choose to zoom it; it is ordered with the balloons but never replaces one.
  const effects = dets.filter((d) => d.c === 2 && d.s >= SFX_SCORE && d.w > 0.02 && d.h > 0.012 && d.w * d.h <= MAX_SHARE);
  const found = dets
    .filter((d) => d.c === 0)
    .flatMap((d) => splitStacked(d, dets))
    .filter((d) => d.c === 0 && d.s >= MIN_SCORE && d.w > 0.012 && d.h > 0.006 && d.w * d.h <= MAX_SHARE)
    .sort((a, b) => b.s - a.s);
  const kept: Bubble[] = [];
  for (const d of found) {
    const padX = 0.004; const padY = 0.003;
    const x = Math.max(0, d.x - padX); const y = Math.max(0, d.y - padY);
    const box: Bubble = { x, y, w: Math.min(1, d.x + d.w + padX) - x, h: Math.min(1, d.y + d.h + padY) - y };
    if (kept.some((k) => overlap(k, box) > 0.7)) continue; // the same balloon found twice
    kept.push(box);
  }
  for (const d of effects.sort((a, b) => b.s - a.s)) {
    const pad = 0.01;
    const x = Math.max(0, d.x - pad); const y = Math.max(0, d.y - pad);
    const box: Bubble = { x, y, w: Math.min(1, d.x + d.w + pad) - x, h: Math.min(1, d.y + d.h + pad) - y, sfx: true };
    if (kept.some((k) => overlap(k, box) > 0.5)) continue; // lettering that is really part of a balloon
    kept.push(box);
  }
  // Balloons that touch are boxed into each other. Each balloon's own lettering is the text boxes (class 1) that sit inside it; pull each box back
  // only as far as the neighbours' lettering, never into its own, so a lifted balloon carries no piece of the next one and loses none of itself.
  const textOf = (b: Bubble): Bubble => {
    const mine = dets.filter((t) => t.c === 1 && t.x + t.w / 2 >= b.x && t.x + t.w / 2 <= b.x + b.w && t.y + t.h / 2 >= b.y && t.y + t.h / 2 <= b.y + b.h);
    if (mine.length === 0) { const px = b.w * 0.15; const py = b.h * 0.15; return { x: b.x + px, y: b.y + py, w: b.w - 2 * px, h: b.h - 2 * py }; }
    const x = Math.min(...mine.map((t) => t.x)); const y = Math.min(...mine.map((t) => t.y));
    return { x, y, w: Math.max(...mine.map((t) => t.x + t.w)) - x, h: Math.max(...mine.map((t) => t.y + t.h)) - y };
  };
  const texts = kept.map(textOf);
  const clipped = kept.map((b, i) => ({ ...clipToNeighbours(b, texts[i], texts.filter((_, j) => j !== i)), ...(b.sfx ? { sfx: true } : {}) }));
  kept.splice(0, kept.length, ...clipped);
  // Reading order with the same panel-aware cut the text reader uses (each box stands in as one line of lettering).
  const blocks: OcrLine[][] = kept.map((b) => [{ text: 'x', x: b.x, y: b.y, w: b.w, h: b.h }]);
  return orderBlocks(blocks, rtl).map(([l]) => kept.find((b) => b.x === l.x && b.y === l.y && b.w === l.w && b.h === l.h) as Bubble);
}
