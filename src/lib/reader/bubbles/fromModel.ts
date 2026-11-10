// Turning the neural detector's boxes into zoom targets. The detector draws the balloon itself (not just its lettering), so no outline hunting is
// needed here: drop weak or duplicate boxes, keep a hair of air around each, and put them in reading order.
import { orderBlocks, type OcrLine } from '../ocr/layout';
import type { Bubble } from './bubbles';

export type Detection = { c: number; s: number; x: number; y: number; w: number; h: number };

const MIN_SCORE = 0.4;
const MAX_SHARE = 0.25;

const overlap = (a: Bubble, b: Bubble) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x); const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? (w * h) / Math.min(a.w * a.h, b.w * b.h) : 0;
};

export function bubblesFromDetections(dets: Detection[], rtl: boolean): Bubble[] {
  // Class 0 is the balloon (captions included). Lettering outside a balloon (sound effects, titles) is left alone.
  const found = dets
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
  // Reading order with the same panel-aware cut the text reader uses (each box stands in as one line of lettering).
  const blocks: OcrLine[][] = kept.map((b) => [{ text: 'x', x: b.x, y: b.y, w: b.w, h: b.h }]);
  return orderBlocks(blocks, rtl).map(([l]) => kept.find((b) => b.x === l.x && b.y === l.y && b.w === l.w && b.h === l.h) as Bubble);
}
