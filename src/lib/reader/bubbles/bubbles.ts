// Bubble Zoom: turning the text boxes found on a page into zoom targets, and deciding which one a tap means.
// Everything is in fractions (0..1) of the page, origin top-left, so it works at any zoom or screen size.
import type { Panel } from '../guided/panels';

/** `tight`: just the lettering, kept when no balloon outline could be found (so a lift can use it instead of the big padded box). */
export type Bubble = Panel & { tight?: Panel };

/** The balloon is bigger than the lettering inside it; open each box up so the outline is not cut off. */
export function padBubble(box: Panel): Bubble {
  const px = box.w * 0.22 + 0.012; const py = box.h * 0.22 + 0.01;
  const x = Math.max(0, box.x - px); const y = Math.max(0, box.y - py);
  return { x, y, w: Math.min(1, box.x + box.w + px) - x, h: Math.min(1, box.y + box.h + py) - y };
}

/** A balloon is a part of a page, not a big share of it. */
const isBalloonSized = (b: Panel) => b.w < 0.7 && b.h < 0.35 && b.w * b.h < 0.12;

/** Detected text boxes → padded zoom targets, with specks and page-sized boxes dropped. */
/** Drops a box that mostly lies on top of one already kept (the same balloon found twice, or its lettering inside it). */
export function dedupeBubbles(list: Bubble[]): Bubble[] {
  const kept: Bubble[] = [];
  for (const b of list) {
    const dup = kept.some((k) => {
      const w = Math.min(k.x + k.w, b.x + b.w) - Math.max(k.x, b.x); const h = Math.min(k.y + k.h, b.y + b.h) - Math.max(k.y, b.y);
      return w > 0 && h > 0 && (w * h) / Math.min(k.w * k.h, b.w * b.h) > 0.6;
    });
    if (!dup) kept.push(b);
  }
  return kept;
}

/**
 * A block of lettering the text reader grouped as one balloon may really be two (stacked, even overlapping, balloons whose lines are close and
 * alike in size). Between two lines of one balloon there is only paper; between two balloons there is an outline. So walk from each line to the
 * next and look for a dark pixel in the stretch between their boxes: found, they are different balloons. Lines come back grouped by balloon.
 */
export function splitByBalloon(gray: Uint8Array, w: number, h: number, lines: Panel[]): Panel[][] {
  if (lines.length < 2) return [lines];
  const sorted = [...lines].sort((p, q) => p.y - q.y || p.x - q.x);
  const paper = (l: Panel) => {
    const x0 = Math.max(0, Math.floor(l.x * w)); const x1 = Math.min(w - 1, Math.ceil((l.x + l.w) * w) - 1);
    const y0 = Math.max(0, Math.floor(l.y * h)); const y1 = Math.min(h - 1, Math.ceil((l.y + l.h) * h) - 1);
    const hist = new Uint32Array(64);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) hist[gray[y * w + x] >> 2]++;
    let bin = 0; for (let v = 0; v < 64; v++) if (hist[v] >= hist[bin]) bin = v;
    return bin * 4 + 2;
  };
  const inside = (l: Panel, px: number, py: number) => px >= l.x * w - 1 && px <= (l.x + l.w) * w + 1 && py >= l.y * h - 1 && py <= (l.y + l.h) * h + 1;
  const groups: Panel[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]; const b = sorted[i];
    const shade = Math.min(paper(a), paper(b));
    const ax = (a.x + a.w / 2) * w; const ay = (a.y + a.h / 2) * h; const bx = (b.x + b.w / 2) * w; const by = (b.y + b.h / 2) * h;
    const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    let dark = 0;
    for (let k = 0; k <= steps; k++) {
      const px = ax + ((bx - ax) * k) / steps; const py = ay + ((by - ay) * k) / steps;
      if (inside(a, px, py) || inside(b, px, py)) continue;
      const xi = Math.min(w - 1, Math.max(0, Math.round(px))); const yi = Math.min(h - 1, Math.max(0, Math.round(py)));
      if (gray[yi * w + xi] < shade - 40) dark++;
    }
    if (dark >= 1) groups.push([b]); else groups[groups.length - 1].push(b);
  }
  return groups;
}

const unionBox = (ls: Panel[]): Panel => {
  const x = Math.min(...ls.map((l) => l.x)); const y = Math.min(...ls.map((l) => l.y));
  return { x, y, w: Math.max(...ls.map((l) => l.x + l.w)) - x, h: Math.max(...ls.map((l) => l.y + l.h)) - y };
};

/**
 * A balloon's grown box may reach into the balloon next to it (they touch, or overlap). Pull each edge back to halfway between this balloon's
 * lettering and the neighbour's, on whichever side the neighbour lies, so the cut-out never carries a piece of another balloon. The lettering
 * itself is never cut.
 */
export function clipToNeighbours(grown: Panel, own: Panel, others: Panel[]): Panel {
  let x0 = grown.x; let y0 = grown.y; let x1 = grown.x + grown.w; let y1 = grown.y + grown.h;
  const ox1 = own.x + own.w; const oy1 = own.y + own.h;
  for (const t of others) {
    const tx1 = t.x + t.w; const ty1 = t.y + t.h;
    if (tx1 <= x0 || t.x >= x1 || ty1 <= y0 || t.y >= y1) continue; // the neighbour's lettering is not inside the grown box
    const dx = ((t.x + tx1) / 2 - (own.x + ox1) / 2) / (own.w + t.w); const dy = ((t.y + ty1) / 2 - (own.y + oy1) / 2) / (own.h + t.h);
    if (Math.abs(dy) >= Math.abs(dx)) {
      if (dy > 0) y1 = Math.min(y1, Math.max(oy1, (oy1 + t.y) / 2)); else y0 = Math.max(y0, Math.min(own.y, (ty1 + own.y) / 2));
    } else if (dx > 0) x1 = Math.min(x1, Math.max(ox1, (ox1 + t.x) / 2)); else x0 = Math.max(x0, Math.min(own.x, (tx1 + own.x) / 2));
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function toBubbles(boxes: Array<Panel & { lines?: Panel[] }>, gray?: { data: Uint8Array; width: number; height: number }): Bubble[] {
  // Blocks that are really several balloons become several boxes (in the same reading order, top to bottom within the block).
  if (gray) {
    boxes = boxes.flatMap((b) => {
      if (!b.lines || b.lines.length < 2) return [b];
      const groups = splitByBalloon(gray.data, gray.width, gray.height, b.lines);
      return groups.length < 2 ? [b] : groups.map(unionBox).sort((p, q) => p.y - q.y || p.x - q.x);
    });
  }

  // A balloon is a part of a page; a "balloon" that is a big share of it is lettering that was grouped with other text (a TV's captions, a sign).
  const texts = boxes.filter((b) => b.w * b.h > 0.0002 && isBalloonSized(b));
  return dedupeBubbles(texts.map((b) => {
    const grown = gray ? growToBalloon(gray.data, gray.width, gray.height, b) : null;
    // No balloon outline found (lettering straight on the art, such as a TV caption): keep to the lettering itself so it neither steals taps from real balloons nor lifts a wide patch of picture.
    const box = grown && isBalloonSized(grown) ? grown : padBubble(b);
    return clipToNeighbours(box, b, texts.filter((t) => t !== b));
  }));
}

/** The bubble under a tap (smallest wins when they overlap), or -1. `slack` widens every box a little for fat fingers. */
export function bubbleAt(bubbles: Bubble[], x: number, y: number, slack = 0.015): number {
  let best = -1; let bestArea = Infinity;
  bubbles.forEach((b, i) => {
    if (x >= b.x - slack && x <= b.x + b.w + slack && y >= b.y - slack && y <= b.y + b.h + slack && b.w * b.h < bestArea) { best = i; bestArea = b.w * b.h; }
  });
  return best;
}

/** No balloons found (or the tap missed them all): a window about the tap, so a bubble can still be picked by hand. */
export function manualBubble(x: number, y: number, aspect: number): Bubble {
  // `aspect`: how tall a window is, relative to its width, in page fractions, for a window shaped like the screen.
  const w = 0.42; const h = Math.min(0.5, w * aspect);
  const bx = Math.min(1 - w, Math.max(0, x - w / 2)); const by = Math.min(1 - h, Math.max(0, y - h / 2));
  return { x: bx, y: by, w, h };
}

/**
 * The text box is only the lettering; the balloon is the (usually lighter) shape around it, closed by its outline.
 * Starting from the pixels behind the text, spread over everything of about the same shade, but never far past the lettering (where two balloons
 * touch, the fill must stop instead of taking the neighbour in); the area reached is the balloon.
 * Returns null when it fills right up to its limit (no outline to stop at) or the fill is not one flat shade, so the caller can use the lettering alone.
 */
export function growToBalloon(gray: Uint8Array, w: number, h: number, box: Panel): Bubble | null {
  const x0 = Math.max(0, Math.floor(box.x * w)); const x1 = Math.min(w - 1, Math.ceil((box.x + box.w) * w) - 1);
  const y0 = Math.max(0, Math.floor(box.y * h)); const y1 = Math.min(h - 1, Math.ceil((box.y + box.h) * h) - 1);
  if (x1 < x0 || y1 < y0) return null;
  // The shade behind the lettering: the most common one inside the text box.
  const hist = new Uint32Array(256);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) hist[(gray[y * w + x] >> 2) << 2]++;
  let bg = 0; for (let v = 0; v < 256; v++) if (hist[v] > hist[bg]) bg = v;
  const near = (v: number) => Math.abs(v - bg) <= 36;
  // A balloon is the lettering plus some air, never several times that.
  const fx0 = Math.max(0, Math.floor((box.x - (box.w * 0.8 + 0.02)) * w)); const fx1 = Math.min(w - 1, Math.ceil((box.x + box.w + (box.w * 0.8 + 0.02)) * w));
  const fy0 = Math.max(0, Math.floor((box.y - (box.h * 1.0 + 0.02)) * h)); const fy1 = Math.min(h - 1, Math.ceil((box.y + box.h + (box.h * 1.0 + 0.02)) * h));
  const seen = new Uint8Array(w * h); const stack: number[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * w + x; if (near(gray[i])) { seen[i] = 1; stack.push(i); } }
  if (stack.length === 0) return null;
  const limit = (fx1 - fx0 + 1) * (fy1 - fy0 + 1); let count = 0;
  let minX = x0; let maxX = x1; let minY = y0; let maxY = y1;
  let sum = 0; let sq = 0;
  while (stack.length) {
    const i = stack.pop() as number; const x = i % w; const y = (i - x) / w;
    if (++count > limit) return null;
    sum += gray[i]; sq += gray[i] * gray[i];
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (x > fx0 && !seen[i - 1] && near(gray[i - 1])) { seen[i - 1] = 1; stack.push(i - 1); }
    if (x < fx1 && !seen[i + 1] && near(gray[i + 1])) { seen[i + 1] = 1; stack.push(i + 1); }
    if (y > fy0 && !seen[i - w] && near(gray[i - w])) { seen[i - w] = 1; stack.push(i - w); }
    if (y < fy1 && !seen[i + w] && near(gray[i + w])) { seen[i + w] = 1; stack.push(i + w); }
  }
  // Filling right up to the limit along most of its edge means there was no outline to stop at (a plain field, or a caption on flat colour).
  let edgeFilled = 0; let edgeLen = 0;
  for (let x = fx0; x <= fx1; x++) { edgeLen += 2; edgeFilled += seen[fy0 * w + x] + seen[fy1 * w + x]; }
  for (let y = fy0 + 1; y < fy1; y++) { edgeLen += 2; edgeFilled += seen[y * w + fx0] + seen[y * w + fx1]; }
  if (edgeLen > 0 && edgeFilled / edgeLen > 0.3) return null;
  // A balloon's fill is one flat shade; a fill that varies is a patch of artwork that happened to be close in tone.
  const mean = sum / count;
  if (Math.sqrt(Math.max(0, sq / count - mean * mean)) > 14) return null;
  // Include the outline (a couple of pixels) and a hair of air.
  const gx = 3 / w + 0.006; const gy = 3 / h + 0.006;
  const x = Math.max(0, minX / w - gx); const y = Math.max(0, minY / h - gy);
  return { x, y, w: Math.min(1, (maxX + 1) / w + gx) - x, h: Math.min(1, (maxY + 1) / h + gy) - y };
}

/** A box from two corners dragged in any direction, kept on the page; null when it is too small to be a balloon. */
export function boxFromCorners(ax: number, ay: number, bx: number, by: number): Bubble | null {
  const x0 = Math.min(1, Math.max(0, Math.min(ax, bx))); const x1 = Math.min(1, Math.max(0, Math.max(ax, bx)));
  const y0 = Math.min(1, Math.max(0, Math.min(ay, by))); const y1 = Math.min(1, Math.max(0, Math.max(ay, by)));
  return x1 - x0 < 0.03 || y1 - y0 < 0.015 ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Where a new balloon goes in the reading order: after the last one that starts above it (the same row reads across). */
export function insertInOrder(list: Bubble[], added: Bubble, rtl: boolean): { list: Bubble[]; index: number } {
  let index = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    const before = b.y + b.h * 0.5 < added.y || (Math.abs(b.y - added.y) < 0.03 && (rtl ? b.x > added.x : b.x < added.x));
    if (before) index = i + 1;
  }
  return { list: [...list.slice(0, index), added, ...list.slice(index)], index };
}
