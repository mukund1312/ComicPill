// Reading a photo of a shelf without any cloud AI. Text recognition on the device finds the lettering (spine text runs up or down, which the
// engine reads in place); this works out which lines belong to which spine and what each spine says: title, volume, publisher.
// Pure arithmetic on boxes and strings, so it is the same on every platform and easy to test.
import type { ScannedBook } from './schema';

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

/** Group lines into spines: lines that sit in the same stripe of the shelf belong to the same book. */
export function groupSpines(lines: SpineLine[]): Spine[] {
  const sorted = [...lines].sort((a, b) => a.x + a.w / 2 - (b.x + b.w / 2));
  const stripes: SpineLine[][] = [];
  for (const l of sorted) {
    const last = stripes[stripes.length - 1];
    const range = last ? boxOf(last) : null;
    const shared = range ? Math.min(range.x + range.w, l.x + l.w) - Math.max(range.x, l.x) : 0;
    if (range && shared >= 0.3 * Math.min(range.w, l.w)) last.push(l); else stripes.push([l]);
  }
  const spines: Spine[] = stripes.map((s) => ({ lines: s, box: boxOf(s) }));
  // A stripe with no title in it (only a publisher or a volume number) is a second line of its neighbour's spine, if it sits right beside it.
  const hasTitle = (s: Spine) => s.lines.some((l) => !isPublisher(l.text) && splitVolume(l.text).rest.length >= 2);
  const out: Spine[] = [];
  for (const s of spines) {
    const prev = out[out.length - 1];
    if (!hasTitle(s) && prev && s.box.x - (prev.box.x + prev.box.w) < 0.02) { prev.lines.push(...s.lines); prev.box = boxOf(prev.lines); }
    else out.push(s);
  }
  return out;
}

/** What one spine says. The biggest lettering is the title; publisher names are set aside; a volume marker becomes the volume. */
export function readSpine(spine: Spine): SpineBook | null {
  const lines = [...spine.lines].sort((a, b) => (a.dir === 'up' ? a.x - b.x : b.x - a.x)); // the first line of a spine sits on its right when the text runs down
  const rawText = lines.map((l) => l.text).join(' | ');
  let volume: string | null = null;
  const titleParts: SpineLine[] = [];
  const creators: string[] = [];
  const parsed = lines.map((l) => ({ l, ...splitVolume(l.text) }));
  const candidates = parsed.filter((p) => !isPublisher(p.l.text) && !isPublisher(p.rest) && p.rest.length >= 2);
  const biggest = Math.max(0, ...candidates.map((p) => p.l.w));
  for (const p of parsed) {
    if (p.volume && !volume) volume = p.volume;
    if (isPublisher(p.l.text) || isPublisher(p.rest) || p.rest.length < 2) continue; // “Vol. 3 IMAGE” is a volume and a publisher, not a title
    // A line set in much smaller type that reads like a person's name is a creator, not part of the title.
    if (looksLikeName(p.rest) && candidates.length > 1 && p.l.w < 0.85 * biggest) creators.push(p.rest);
    else titleParts.push({ ...p.l, text: p.rest });
  }
  const title = titleParts.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
  if (alnum(title) < 2) return null;
  const confs = titleParts.map((l) => l.conf ?? 1);
  const conf = Math.min(...confs);
  return { title, volume, creators: creators.slice(0, 3), confidence: conf >= 0.9 && alnum(title) >= 4 ? 'high' : conf >= 0.6 ? 'medium' : 'low', seenAs: 'spine', box: spine.box, rawText };
}

/** Everything the photo says, one entry per spine, left to right. */
export function readShelf(passes: ReadPass[]): SpineBook[] {
  return groupSpines(dedupeLines(toPhotoFrame(passes))).map(readSpine).filter((b): b is SpineBook => b !== null);
}
