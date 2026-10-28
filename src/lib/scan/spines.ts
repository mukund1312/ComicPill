// Reading a photo of a shelf without any cloud AI. Text recognition on the device finds the lettering (spine text runs up or down, which the
// engine reads in place); this works out which lines belong to which spine and what each spine says: title, volume, publisher.
// Pure arithmetic on boxes and strings, so it is the same on every platform and easy to test.
import type { ScannedBook } from './schema';
import { columnPersistence, findEdges, transpose, type Gray } from './segment';

/** A line of text and its box, as fractions (0..1) of the photo, origin top-left. */
export type SpineLine = { text: string; x: number; y: number; w: number; h: number; conf?: number; dir?: 'down' | 'up' };
/** One read of the photo. `turn` is how the image was turned before reading: 0 as taken, 180 upside down (to read text that runs upward). */
export type ReadPass = { turn: 0 | 180; lines: SpineLine[] };
export type Spine = { lines: SpineLine[]; box: { x: number; y: number; w: number; h: number } };
export type SpineBook = ScannedBook & { box: Spine['box']; rawText: string };

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
  const title = titleParts.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
  if (alnum(title) < 2) return null;
  const conf = Math.min(...titleParts.map((l) => l.conf ?? 1));
  return { title, volume, creators: creators.slice(0, 3), confidence: conf >= 0.9 && alnum(title) >= 4 ? 'high' : conf >= 0.6 ? 'medium' : 'low', seenAs: 'spine', box: spine.box, rawText };
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

/** Everything the photo says, one entry per book, in order along the shelf. With the picture's pixels, real edges between books sharpen the grouping. */
export function readShelf(passes: ReadPass[], gray?: Gray): SpineBook[] {
  const lines = dedupeLines(toPhotoFrame(passes));
  if (lines.length === 0) return [];
  let spines = groupSpines(lines);
  if (gray) spines = splitAtEdges(spines, shelfEdges(lines, gray), shelfIsVertical(lines));
  return spines.map(readSpine).filter((b): b is SpineBook => b !== null);
}
