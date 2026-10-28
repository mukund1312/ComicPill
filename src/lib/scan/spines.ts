// Reading a photo of a shelf without any cloud AI. Text recognition on the device finds the lettering (spine text runs up or down, which the
// engine reads in place); this works out which lines belong to which spine and what each spine says: title, volume, publisher.
// Pure arithmetic on boxes and strings, so it is the same on every platform and easy to test.
import type { ScannedBook } from './schema';
import { columnEdges, columnPersistence, findEdges, partitionShelf, transpose, verticalExtent, type Gray } from './segment';

/** A line of text and its box, as fractions (0..1) of the photo, origin top-left. */
export type SpineLine = { text: string; x: number; y: number; w: number; h: number; conf?: number; dir?: 'down' | 'up' };
/** One read of the photo. `turn` is how the image was turned before reading: 0 as taken, 180 upside down (to read text that runs upward). */
export type ReadPass = { turn: 0 | 180; lines: SpineLine[] };
export type Spine = { lines: SpineLine[]; box: { x: number; y: number; w: number; h: number }; /** The spine itself, before the box was widened to hold its lean: what a tilted outline is drawn around. */ core?: { x: number; y: number; w: number; h: number }; /** Pixels sideways per pixel down: the lean of this book's edges in the photo. */ lean?: number; /** A volume number printed on the spine on a line of its own (the “1”, “2”, “3” at the foot of a spine). */ volumeHint?: string };
export type SpineBook = ScannedBook & { box: Spine['box']; core?: Spine['box']; /** How much the spine leans in the photo: sideways per down, both as fractions of the photo's sides' pixels. 0 for an upright spine. */ lean: number; rawText: string; /** Which way the lettering runs: down the spine (most books), or up it. */ dir: 'down' | 'up' };

type Box = { x: number; y: number; w: number; h: number };
const area = (b: Box) => b.w * b.h;
function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
const alnum = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '').length;

/** Bring every pass back into the photo as taken; an upside-down pass has its boxes flipped, and text it read is text that runs upward. */
export function toPhotoFrame(passes: ReadPass[]): SpineLine[] {
  return passes.flatMap((p) => p.lines.map((l): SpineLine => (p.turn === 180
    ? { ...l, x: 1 - (l.x + l.w), y: 1 - (l.y + l.h), dir: 'up' }
    : { ...l, dir: 'down' })));
}

/** One copy of each line: where the passes read the same place, keep the more confident, then the longer, reading. Drops marks that aren't text. */
export function dedupeLines(lines: SpineLine[]): SpineLine[] {
  const usable = lines.filter((l) => alnum(l.text) >= 2 && (l.conf ?? 1) >= 0.4);
  usable.sort((a, b) => (b.conf ?? 1) - (a.conf ?? 1) || b.text.length - a.text.length);
  const kept: SpineLine[] = [];
  for (const l of usable) if (!kept.some((k) => overlap(k, l) / Math.min(area(k), area(l)) >= 0.5)) kept.push(l);
  return kept;
}

const boxOf = (lines: SpineLine[]): Box => {
  const x = Math.min(...lines.map((l) => l.x)); const y = Math.min(...lines.map((l) => l.y));
  return { x, y, w: Math.max(...lines.map((l) => l.x + l.w)) - x, h: Math.max(...lines.map((l) => l.y + l.h)) - y };
};

const PUBLISHERS = ['marvel', 'marvel comics', 'dc', 'dc comics', 'image', 'image comics', 'dark horse', 'dark horse comics', 'idw', 'idw publishing', 'boom', 'boom studios', 'vertigo',
  'titan', 'titan comics', 'oni press', 'fantagraphics', 'viz', 'viz media', 'kodansha', 'yen press', 'seven seas', 'vault', 'dynamite', 'valiant', 'archie', 'abrams', 'top shelf', 'first second', 'drawn & quarterly', 'penguin', 'pantheon'];
const isPublisher = (t: string) => PUBLISHERS.includes(t.toLowerCase().replace(/[^a-z& ]+/g, ' ').replace(/\s+/g, ' ').trim());

const WORD_NUMBER: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' };
// "Vol. 3", "Volume 12", "Book Two", "#7", "No. 4" at the end of a line, or a line that is nothing else.
const VOLUME = /(?:^|\s)(?:vol(?:ume)?\.?|book|part|no\.?|#)\s*(\d{1,3}|[ivx]{1,4}|one|two|three|four|five|six|seven|eight|nine|ten)\b\.?/i;

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };

/** Lines that are only a volume number (“2”, “II”): too short to count as lettering, but they tell volumes of one series apart. */
export function volumeMarkers(lines: SpineLine[]): { line: SpineLine; volume: string }[] {
  const out: { line: SpineLine; volume: string }[] = [];
  for (const l of lines) {
    const t = l.text.trim().replace(/[.,]+$/, '');
    if ((l.conf ?? 1) < 0.6) continue;
    const n = /^\d{1,2}$/.test(t) ? Number(t) : ROMAN[t.toUpperCase()] && /^[IVX]+$/.test(t) ? ROMAN[t.toUpperCase()] : 0;
    if (n > 0 && n <= 30 && !out.some((o) => overlap(o.line, l) > 0)) out.push({ line: l, volume: `Vol. ${n}` });
  }
  return out;
}

/** Give each book the volume number printed on its own spine, if there is one. */
export function attachVolumes(spines: Spine[], markers: { line: SpineLine; volume: string }[], vertical: boolean): void {
  for (const s of spines) {
    const [a, b] = vertical ? [s.box.x, s.box.x + s.box.w] : [s.box.y, s.box.y + s.box.h];
    const mine = markers.filter((m) => { const c = vertical ? m.line.x + m.line.w / 2 : m.line.y + m.line.h / 2; return c >= a && c <= b; });
    // Several candidates (a page number on a stray line, say): trust the one nearest the foot of the spine, where publishers print it.
    if (mine.length) s.volumeHint = [...mine].sort((p, q) => (vertical ? q.line.y - p.line.y : q.line.x - p.line.x))[0].volume;
  }
}

/** A volume or issue marker, and the text with it taken out. */
export function splitVolume(text: string): { rest: string; volume: string | null } {
  const m = text.match(VOLUME);
  if (!m) return { rest: text.trim(), volume: null };
  const word = m[1].toLowerCase();
  return { rest: `${text.slice(0, m.index)} ${text.slice((m.index ?? 0) + m[0].length)}`.replace(/\s+/g, ' ').trim(), volume: `Vol. ${WORD_NUMBER[word] ?? m[1].toUpperCase()}` };
}

const looksLikeName = (t: string) => /^[\p{Lu}][\p{L}.'’-]+(?: [\p{Lu}][\p{L}.'’-]+){1,2}$/u.test(t.trim()) && !/\d/.test(t);

/** Does the shelf hold standing books (text runs along tall, narrow spines) or books lying flat (text runs across)? */
export function shelfIsVertical(lines: SpineLine[]): boolean {
  const tall = lines.filter((l) => l.h > l.w * 1.3).length;
  const wide = lines.filter((l) => l.w > l.h * 1.3).length;
  return tall >= wide;
}

/** The size of a line's lettering: how thick the text is, across its direction. */
const lettering = (l: SpineLine, vertical: boolean) => (vertical ? l.w : l.h);
const crossCentre = (l: SpineLine, vertical: boolean) => (vertical ? l.x + l.w / 2 : l.y + l.h / 2);

/**
 * Group lines into books. Along the shelf, the lines of one book sit close together and the next book starts after a gap; a gap wider than
 * about 0.7 of a typical line's thickness starts a new book (measured on real shelves of standing books, a flat pile and thin paperbacks).
 * Lines running the other way to most of the shelf (a book turned round) are left out of the grouping rather than splitting books.
 */
export function groupSpines(lines: SpineLine[]): Spine[] {
  if (lines.length === 0) return [];
  const vertical = shelfIsVertical(lines);
  const along = lines.filter((l) => (l.h > l.w) === vertical).sort((a, b) => crossCentre(a, vertical) - crossCentre(b, vertical));
  if (along.length === 0) return [];
  const sizes = along.map((l) => lettering(l, vertical)).sort((a, b) => a - b);
  const threshold = 0.7 * sizes[Math.floor(sizes.length / 2)];
  const stripes: SpineLine[][] = [];
  for (const l of along) {
    const last = stripes[stripes.length - 1];
    if (last && crossCentre(l, vertical) - crossCentre(last[last.length - 1], vertical) <= threshold) last.push(l); else stripes.push([l]);
  }
  const spines: Spine[] = stripes.map((s) => ({ lines: s, box: boxOf(s) }));
  // A stripe with no title in it (only a publisher or a volume number) is a second line of its neighbour's book, if it sits right beside it.
  const hasTitle = (s: Spine) => s.lines.some((l) => !isPublisher(l.text) && splitVolume(l.text).rest.length >= 2);
  const out: Spine[] = [];
  for (const s of spines) {
    const prev = out[out.length - 1];
    const gap = vertical ? s.box.x - (prev?.box.x ?? 0) - (prev?.box.w ?? 0) : s.box.y - (prev?.box.y ?? 0) - (prev?.box.h ?? 0);
    if (!hasTitle(s) && prev && gap < 0.02) { prev.lines.push(...s.lines); prev.box = boxOf(prev.lines); }
    else out.push(s);
  }
  return out;
}

/** What one book says. The biggest lettering is the title; smaller lettering is credits; publisher names are set aside; a volume marker becomes the volume. */
export function readSpine(spine: Spine): SpineBook | null {
  const vertical = shelfIsVertical(spine.lines);
  // Lines of a title read in the order of the text: down a spine the first line is on the right, up a spine on the left, across a book from the top.
  const lines = [...spine.lines].sort((a, b) => (vertical ? (a.dir === 'up' ? a.x - b.x : b.x - a.x) : a.y - b.y || a.x - b.x));
  const rawText = lines.map((l) => l.text).join(' | ');
  let volume: string | null = null;
  const parsed = lines.map((l) => ({ l, ...splitVolume(l.text) }));
  const candidates = parsed.filter((p) => !isPublisher(p.l.text) && !isPublisher(p.rest) && p.rest.length >= 2);
  const biggest = Math.max(0, ...candidates.map((p) => lettering(p.l, vertical)));
  const titleParts: SpineLine[] = [];
  const creators: string[] = [];
  for (const p of parsed) {
    if (p.volume && !volume) volume = p.volume;
    if (isPublisher(p.l.text) || isPublisher(p.rest) || p.rest.length < 2) continue; // “Vol. 3 IMAGE” is a volume and a publisher, not a title
    // Smaller lettering, or a list of names joined by bullets, is the credits (writer, artist) rather than the title.
    const credits = (candidates.length > 1 && lettering(p.l, vertical) < 0.72 * biggest) || /[•·]/.test(p.rest) || (looksLikeName(p.rest) && candidates.length > 1 && lettering(p.l, vertical) < 0.85 * biggest);
    if (credits) creators.push(p.rest); else titleParts.push({ ...p.l, text: p.rest });
  }
  // A spine whose only text is one line carrying both title and credits (“BATMAN: YEAR ONE ▸ MILLER • MAZZUCCHELLI”) must not lose its title:
  // the biggest line stands in as the title, and the matching copes with the credits being in it.
  if (titleParts.length === 0 && candidates.length > 0) {
    const biggestLine = [...candidates].sort((x, y) => lettering(y.l, vertical) - lettering(x.l, vertical))[0];
    titleParts.push({ ...biggestLine.l, text: biggestLine.rest });
    const at = creators.indexOf(biggestLine.rest); if (at >= 0) creators.splice(at, 1);
  }
  const title = titleParts.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
  if (alnum(title) < 2) return null;
  if (!volume && spine.volumeHint) volume = spine.volumeHint;
  const conf = Math.min(...titleParts.map((l) => l.conf ?? 1));
  const up = spine.lines.filter((l) => l.dir === 'up').length > spine.lines.filter((l) => l.dir !== 'up').length;
  return { title, volume, creators: creators.slice(0, 3), confidence: conf >= 0.9 && alnum(title) >= 4 ? 'high' : conf >= 0.6 ? 'medium' : 'low', seenAs: 'spine', box: spine.box, core: spine.core, rawText, dir: up ? 'up' : 'down', lean: spine.lean ?? 0 };
}

const hasTitleLine = (s: Spine) => s.lines.some((l) => !isPublisher(l.text) && splitVolume(l.text).rest.length >= 3);

/** Where the physical edges between books are in the photo, as fractions of the shelf's length. */
export function shelfEdges(lines: SpineLine[], gray: Gray): number[] {
  const vertical = shelfIsVertical(lines);
  const picture = vertical ? gray : transpose(gray);
  // Look only at the part of the picture where books are: from where the lettering starts to where it ends, across the shelf.
  const spans = lines.map((l) => (vertical ? [l.y, l.y + l.h] : [l.x, l.x + l.w])).sort((a, b) => a[0] - b[0]);
  const from = spans[Math.floor(spans.length * 0.1)][0]; const to = spans[Math.floor(spans.length * 0.9)][1];
  return findEdges(columnPersistence(picture, from, Math.min(1, to)));
}

/**
 * Split a group that the lettering says is one book wherever a real edge runs between its lines, so two thin spines read as two. A piece left
 * with no title of its own (a stripe of colour or a credits line cut off by an edge) is joined back to the book beside it.
 */
export function splitAtEdges(spines: Spine[], edges: number[], vertical: boolean): Spine[] {
  const centre = (l: SpineLine) => crossCentre(l, vertical);
  // Only the middle of a line's box counts as its lettering: the engine's boxes are loose on leaning spines, so a real edge can fall inside the outer part of a neighbour's box.
  const inside = (l: SpineLine, e: number) => (vertical ? e > l.x + 0.35 * l.w && e < l.x + 0.65 * l.w : e > l.y + 0.35 * l.h && e < l.y + 0.65 * l.h);
  const out: Spine[] = [];
  for (const spine of spines) {
    const lines = [...spine.lines].sort((a, b) => centre(a) - centre(b));
    const pieces: SpineLine[][] = [[]];
    lines.forEach((l, i) => {
      if (i > 0) {
        const prev = lines[i - 1];
        // An edge between the two lines' centres, that doesn't cut through the lettering of either, separates them.
        const cuts = edges.some((e) => e > centre(prev) && e < centre(l) && !inside(prev, e) && !inside(l, e));
        if (cuts) pieces.push([]);
      }
      pieces[pieces.length - 1].push(l);
    });
    const made = pieces.map((p) => ({ lines: p, box: boxOf(p) }));
    // join title-less pieces to the nearest piece that has one
    const kept: Spine[] = [];
    for (const piece of made) {
      if (hasTitleLine(piece) || kept.length === 0) { kept.push(piece); continue; }
      const prev = kept[kept.length - 1]; prev.lines.push(...piece.lines); prev.box = boxOf(prev.lines);
    }
    out.push(...kept);
  }
  return out;
}

const SERIES_STOP = new Set(['the', 'a', 'an', 'of', 'and', 'dc', 'comics', 'vol', 'volume', 'book', 'by']);
const firstWord = (text: string): string => (text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]+/g) ?? []).find((w) => !SERIES_STOP.has(w)) ?? '';
const wordCount = (text: string) => (text.match(/[A-Za-z0-9]+/g) ?? []).length;

/**
 * Where a stretch the picture couldn't cut should be cut anyway. A spine says its series name once, so two lines inside one stretch that each
 * start with the same series word and then say something different (“BATMAN THE CITY OF OWLS”, “BATMAN DEATH OF THE FAMILY”) are two books side
 * by side. Returns the positions along the shelf (fractions) between such pairs, between the two lines' centres. Credits and publisher names never count.
 */
export function repeatedSeriesCuts(lines: SpineLine[], vertical: boolean, centre: (l: SpineLine) => number = (l) => crossCentre(l, vertical)): number[] {
  const titles = lines.filter((l) => !isPublisher(l.text) && !/[•·|]/.test(l.text) && wordCount(l.text) >= 3 && alnum(l.text) >= 10).sort((a, b) => centre(a) - centre(b));
  // Lines that start with the same series word, in order along the shelf (a credits line may sit between two of them).
  const bySeries = new Map<string, SpineLine[]>();
  for (const l of titles) { const w = firstWord(l.text); if (w.length >= 4) bySeries.set(w, [...(bySeries.get(w) ?? []), l]); }
  const cuts: number[] = [];
  for (const same of bySeries.values()) {
    for (let i = 1; i < same.length; i++) {
      const a = same[i - 1]; const b = same[i];
      const gap = centre(b) - centre(a);
      // far enough apart to be separate lines of lettering, and not the same words read twice
      if (gap < 0.4 * Math.min(lettering(a, vertical), lettering(b, vertical))) continue;
      if (a.text.toLowerCase().replace(/[^a-z0-9]/g, '') === b.text.toLowerCase().replace(/[^a-z0-9]/g, '')) continue;
      cuts.push((centre(a) + centre(b)) / 2);
    }
  }
  cuts.sort((x, y) => x - y);
  return cuts;
}

/**
 * Group lines into books by the best partition of the shelf (see `partitionShelf`): lines whose centre falls in the same stretch belong to one book.
 * Returns the books and the stretch each one occupies along the shelf, so the box can span the whole spine and not just the lettering.
 */
export function groupByPartition(lines: SpineLine[], gray: Gray, tune: { cutCost?: number; minWidth?: number; gapFactor?: number } = {}): { spine: Spine; from: number; to: number }[] {
  const vertical = shelfIsVertical(lines);
  const along = lines.filter((l) => (l.h > l.w) === vertical);
  if (along.length === 0) return [];
  const picture = vertical ? gray : transpose(gray);
  const spans = along.map((l) => (vertical ? [l.y, l.y + l.h] : [l.x, l.x + l.w])).sort((a, b) => a[0] - b[0]);
  const fromRow = spans[Math.floor(spans.length * 0.1)][0]; const toRow = Math.min(1, spans[Math.floor(spans.length * 0.9)][1]);
  const { persistence, tilt } = columnEdges(picture, fromRow, toRow);
  // Spines lean in a photo (perspective), so the lettering near the top or foot of a leaning spine sits to one side of the straight cut at mid-height.
  // Each line is moved back along the lean to where it would be at mid-height, so it is judged against the cut that really belongs to its book.
  const midPx = (Math.max(1, Math.floor(fromRow * picture.height)) + Math.min(picture.height - 1, Math.ceil(toRow * picture.height))) / 2;
  const slopeAt = (xNorm: number) => (vertical ? tilt[Math.min(tilt.length - 1, Math.max(0, Math.round(xNorm * picture.width)))] : 0);
  const centre = (l: SpineLine) => { const c = crossCentre(l, vertical); const row = (vertical ? l.y + l.h / 2 : l.x + l.w / 2) * picture.height; return c - (slopeAt(c) * (row - midPx)) / picture.width; };
  const marks = along.map((l) => ({ centre: centre(l), size: lettering(l, vertical) }));
  const cuts0 = partitionShelf(persistence, marks, tune);
  // Stretches that still hold two books' worth of series names are cut where the lettering says.
  // Books lying flat in a pile are all about as thick as each other, so a thin sliver between two cuts is a piece of a book (a line of credits), not a book.
  const mergeSlivers = (segs: { from: number; to: number }[]): { from: number; to: number }[] => {
    if (vertical || segs.length < 3) return segs;
    const med = [...segs].map((x) => x.to - x.from).sort((a, b) => a - b)[Math.floor(segs.length / 2)];
    const out: { from: number; to: number }[] = [];
    for (const seg of segs) {
      const prev = out[out.length - 1];
      if (prev && seg.to - seg.from < 0.5 * med && seg.to - prev.from <= 1.5 * med) prev.to = seg.to; else out.push({ ...seg });
    }
    return out;
  };
  const segments = mergeSlivers(cuts0).flatMap((seg) => {
    const inside = along.filter((l) => { const c = centre(l); return c >= seg.from && c < seg.to + 1e-9; });
    const at = repeatedSeriesCuts(inside, vertical, centre).filter((x) => x > seg.from && x < seg.to);
    const edges = [seg.from, ...at, seg.to];
    return edges.slice(1).map((to, i) => ({ from: edges[i], to }));
  });
  // Each book's lettering, and the top and bottom of its spine as far as the picture shows them.
  const parts = segments.map((seg) => {
    const inside = along.filter((l) => { const c = centre(l); return c >= seg.from && c < seg.to + 1e-9; });
    if (inside.length === 0) return { seg, inside, ext: null as ReturnType<typeof verticalExtent> | null, text: null as Box | null };
    const text = boxOf(inside);
    const [lo, hi] = vertical ? [text.y, text.y + text.h] : [text.x, text.x + text.w];
    return { seg, inside, ext: verticalExtent(picture, seg.from, seg.to, lo, hi), text };
  });
  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const found = parts.filter((p) => p.ext);
  const bottoms = found.filter((p) => p.ext!.bottomFound).map((p) => p.ext!.bottom);
  const tops = found.filter((p) => p.ext!.topFound).map((p) => p.ext!.top);
  // Standing books all rest on the shelf, so they share one bottom; books lying flat have no such line, so each keeps its own.
  const shelfBottom = vertical ? (bottoms.length >= 3 ? median(bottoms) : Math.min(1, Math.max(...found.map((p) => (vertical ? p.text!.y + p.text!.h : p.text!.x + p.text!.w))) + 0.02)) : null;
  const typicalTop = tops.length >= 3 ? median(tops) : null;
  // A pile of flat books shares its left and right edges: use the stack's edges for every book, and ignore lettering beyond them (another object beside the pile).
  const quantile = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  const stackLeft = !vertical && tops.length >= 3 ? quantile(tops, 0.1) : null;
  const stackRight = !vertical && bottoms.length >= 3 ? quantile(bottoms, 0.9) : null;
  return parts.filter((p) => p.inside.length > 0).map(({ seg, inside, ext }) => {
    // Lettering below the shelf belongs to whatever is on the shelf underneath, not to this book; beside a flat pile, to the next object.
    let onShelf = shelfBottom === null ? inside : inside.filter((l) => l.y + l.h / 2 <= shelfBottom + 0.03);
    if (stackRight !== null) onShelf = onShelf.filter((l) => l.x + l.w / 2 <= stackRight + 0.03);
    const lines = onShelf.length ? onShelf : inside;
    const text = boxOf(lines);
    const [lo, hi] = vertical ? [text.y, text.y + text.h] : [text.x, text.x + text.w];
    let top = ext!.top; let bottom = ext!.bottom;
    if (shelfBottom !== null) bottom = Math.max(hi + 0.01, shelfBottom);
    // The top: an edge found above the lettering, if it is near where the other books' tops are (artwork gives false ones); otherwise a typical top, but not far above the lettering.
    const plausible = ext!.topFound && (typicalTop === null || Math.abs(ext!.top - typicalTop) <= 0.07);
    if (!plausible) top = typicalTop !== null ? Math.min(lo - 0.015, Math.max(typicalTop, lo - 0.10)) : Math.max(0, lo - 0.015);
    if (stackLeft !== null) top = Math.min(stackLeft, lo - 0.005);
    if (stackRight !== null) bottom = Math.max(stackRight, hi + 0.005);
    top = Math.min(top, lo - 0.005); bottom = Math.max(bottom, hi + 0.005);
    // A leaning spine's box must contain the whole slanted spine: widen it by how far the lean carries the top and the foot sideways.
    const lean = slopeAt((seg.from + seg.to) / 2);
    const shift = (rowNorm: number) => (lean * (rowNorm * picture.height - midPx)) / picture.width;
    const [s0, s1] = [shift(top), shift(bottom)];
    // (Only half the sideways carry is added: the box is a rectangle around a slanted spine, and a full allowance would swallow its neighbours.)
    const x0 = seg.from + 0.5 * Math.min(0, s0, s1); const x1 = seg.to + 0.5 * Math.max(0, s0, s1);
    const box = vertical ? { x: x0, y: top, w: x1 - x0, h: bottom - top } : { x: top, y: seg.from, w: bottom - top, h: seg.to - seg.from };
    const core = vertical ? { x: seg.from, y: top, w: seg.to - seg.from, h: bottom - top } : undefined;
    return { spine: { lines, box, core, lean: vertical ? lean : 0 }, from: seg.from, to: seg.to };
  });
}

/**
 * Everything the photo says, one entry per book, in order along the shelf. With the picture's pixels, the shelf is cut into books from the real
 * edges in the picture (and each book's box covers its whole spine); without them, books are grouped by their lettering alone.
 */
export function readShelf(passes: ReadPass[], gray?: Gray): SpineBook[] {
  const framed = toPhotoFrame(passes);
  const markers = volumeMarkers(framed);
  const lines = dedupeLines(framed);
  if (lines.length === 0) return [];
  const spines = gray ? groupByPartition(lines, gray).map((g) => g.spine) : groupSpines(lines);
  attachVolumes(spines, markers, shelfIsVertical(lines));
  return spines.map(readSpine).filter((b): b is SpineBook => b !== null);
}
