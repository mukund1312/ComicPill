// Turning raw text-recognition output for a comic page into readable text.
// The engine finds lines of lettering with boxes. A whole page is read at once and again in overlapping tiles (small lettering on a tall page
// gets lost when the engine shrinks it), so the results are merged; then lines are grouped into speech bubbles and put in reading order.
// Everything here is plain arithmetic on boxes, so it is the same on every platform and easy to test.

/** A line of text and its box, as fractions (0..1) of the image it was read from, origin top-left. */
export type OcrLine = { text: string; x: number; y: number; w: number; h: number };
/** One read of part of the page: where that part is on the page, in pixels, and the lines found in it. */
export type OcrRegion = { rect: { x: number; y: number; w: number; h: number }; lines: OcrLine[] };

type Box = { x: number; y: number; w: number; h: number };
type PageLine = OcrLine & { cut: boolean; whole: boolean };

/** Overlapping tiles that cover the page, for reading small lettering. */
export function tileRects(width: number, height: number, rows = 3, cols = 2): Box[] {
  const tw = Math.floor(width / cols); const th = Math.floor(height / rows);
  const ox = Math.floor(tw / 8); const oy = Math.floor(th / 8);
  const out: Box[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = Math.max(0, c * tw - ox); const y = Math.max(0, r * th - oy);
    out.push({ x, y, w: Math.min(width - x, tw + 2 * ox), h: Math.min(height - y, th + 2 * oy) });
  }
  return out;
}

const area = (b: Box) => b.w * b.h;
function intersection(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
/** How much of the smaller box is covered by the other. */
const coverage = (a: Box, b: Box) => intersection(a, b) / Math.max(1e-9, Math.min(area(a), area(b)));

const alnum = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '').length;
/** Stray marks the engine mistakes for text. A lone I, A, ? or ! can be a real word balloon, so those stay. */
const isNoise = (text: string) => { const t = text.trim(); return t.length === 0 || (t.length === 1 && !/[IA?!a]/.test(t)) || (alnum(t) === 0 && t.length < 2); };

/** Bring every region's lines onto the page, drop repeats from the overlaps and fragments cut by a tile's edge, and drop noise. */
export function mergeRegions(regions: OcrRegion[], pageW: number, pageH: number): OcrLine[] {
  const all: PageLine[] = [];
  for (const { rect, lines } of regions) {
    const whole = rect.w >= pageW && rect.h >= pageH;
    for (const l of lines) {
      const x = (rect.x + l.x * rect.w) / pageW; const y = (rect.y + l.y * rect.h) / pageH;
      const w = (l.w * rect.w) / pageW; const h = (l.h * rect.h) / pageH;
      // A line touching an edge of the tile that is not an edge of the page may be a word cut in half.
      const eps = 0.012;
      const touches = (l.x < eps && rect.x > 0) || (l.x + l.w > 1 - eps && rect.x + rect.w < pageW) || (l.y < eps && rect.y > 0) || (l.y + l.h > 1 - eps && rect.y + rect.h < pageH);
      all.push({ text: l.text.trim(), x, y, w, h, cut: !whole && touches, whole });
    }
  }
  // The whole-page read first (it splits lines the way they are set), then complete tile lines, longest first. A later line that sits on top
  // of one already kept is the same text read again, so tiles only add what the whole-page read missed.
  all.sort((a, b) => Number(b.whole) - Number(a.whole) || Number(a.cut) - Number(b.cut) || b.text.length - a.text.length);
  const kept: PageLine[] = [];
  for (const line of all) {
    if (isNoise(line.text)) continue;
    if (kept.some((k) => coverage(k, line) >= 0.5)) continue;
    kept.push(line);
  }
  return kept.map(({ text, x, y, w, h }) => ({ text, x, y, w, h }));
}

/** Lines that sit together as one balloon or caption: stacked closely, about the same size, roughly lined up. */
export function groupIntoBlocks(lines: OcrLine[]): OcrLine[][] {
  const parent = lines.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let i = 0; i < lines.length; i++) for (let j = 0; j < lines.length; j++) {
    const a = lines[i]; const b = lines[j];
    if (a.y >= b.y) continue; // a is the upper one
    const ref = Math.max(a.h, b.h);
    const gap = b.y - (a.y + a.h);
    const similarSize = Math.min(a.h, b.h) / ref >= 0.55;
    const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const lined = overlapX >= 0.25 * Math.min(a.w, b.w) || Math.abs((a.x + a.w / 2) - (b.x + b.w / 2)) <= 0.5 * Math.max(a.w, b.w);
    if (similarSize && lined && gap >= -0.35 * ref && gap <= 0.85 * ref) parent[find(j)] = find(i);
  }
  const groups = new Map<number, OcrLine[]>();
  lines.forEach((l, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), l]); });
  return [...groups.values()].map((g) => g.sort((p, q) => p.y - q.y));
}

const boxOfBlock = (block: OcrLine[]): Box => {
  const x = Math.min(...block.map((l) => l.x)); const y = Math.min(...block.map((l) => l.y));
  return { x, y, w: Math.max(...block.map((l) => l.x + l.w)) - x, h: Math.max(...block.map((l) => l.y + l.h)) - y };
};

type Item = { block: OcrLine[]; box: Box };

/** The widest stretch along one axis that no balloon covers, and where it is. */
function widestGap(items: Item[], axis: 'x' | 'y'): { size: number; at: number } {
  const spans = items.map((i) => (axis === 'x' ? [i.box.x, i.box.x + i.box.w] : [i.box.y, i.box.y + i.box.h])).sort((a, b) => a[0] - b[0]);
  let reach = spans[0][1]; let best = { size: 0, at: 0 };
  for (const [start, end] of spans) {
    if (start - reach > best.size) best = { size: start - reach, at: (start + reach) / 2 };
    reach = Math.max(reach, end);
  }
  return best;
}

// Smallest empty stretch (as a fraction of the page) that counts as the space between panels, going down and going across.
const MIN_GAP_Y = 0.02;
const MIN_GAP_X = 0.04;

/** Balloons in one panel: top to bottom, but ones that start at about the same height (within a few pixels of each other) read across. */
function inPanelOrder(items: Item[], rtl: boolean): Item[] {
  const byTop = [...items].sort((a, b) => a.box.y - b.box.y);
  const rows: Item[][] = [];
  for (const item of byTop) {
    const row = rows[rows.length - 1];
    if (row && item.box.y - row[0].box.y <= 0.25 * Math.min(item.box.h, row[0].box.h)) row.push(item); else rows.push([item]);
  }
  return rows.flatMap((row) => row.sort((a, b) => (rtl ? b.box.x - a.box.x : a.box.x - b.box.x)));
}

/**
 * Reading order, the way panels are read. The page is cut along its widest empty stretch (the gutter between panels), and each side is cut
 * again, until nothing separates what is left; those are read top to bottom. Across a gutter the left comes first (the right first for manga).
 */
function xyCut(items: Item[], rtl: boolean): Item[] {
  if (items.length <= 1) return items;
  const down = widestGap(items, 'y'); const across = widestGap(items, 'x');
  if (down.size < MIN_GAP_Y && across.size < MIN_GAP_X) return inPanelOrder(items, rtl);
  if (down.size / MIN_GAP_Y >= across.size / MIN_GAP_X) {
    return [...xyCut(items.filter((i) => i.box.y < down.at), rtl), ...xyCut(items.filter((i) => i.box.y >= down.at), rtl)];
  }
  const left = xyCut(items.filter((i) => i.box.x < across.at), rtl); const right = xyCut(items.filter((i) => i.box.x >= across.at), rtl);
  return rtl ? [...right, ...left] : [...left, ...right];
}

export function orderBlocks(blocks: OcrLine[][], rtl: boolean): OcrLine[][] {
  return xyCut(blocks.map((block) => ({ block, box: boxOfBlock(block) })), rtl).map((i) => i.block);
}

/** The lines of one block as a sentence: joined with spaces, with a split word (“COM-” / “PREHEND”) put back together. */
export function blockText(block: OcrLine[]): string {
  return block.reduce((out, line, i) => {
    if (i === 0) return line.text;
    return /[^-]-$/.test(out) ? `${out.slice(0, -1)}${line.text}` : `${out} ${line.text}`;
  }, '');
}

export type PageText = { text: string; blocks: string[] };

/** The whole job: merged lines → balloons → reading order → text with a blank line between balloons. */
export function layoutPage(regions: OcrRegion[], pageW: number, pageH: number, opts: { rtl?: boolean } = {}): PageText {
  const lines = mergeRegions(regions, pageW, pageH);
  const blocks = orderBlocks(groupIntoBlocks(lines), !!opts.rtl).map(blockText).filter((t) => t.length > 0);
  return { text: blocks.join('\n\n'), blocks };
}
