// Scan a photo of a shelf entirely on the device: no account, no key, nothing uploaded.
// Stages (reported as they happen so the screen can show progress): detecting books → reading spine text → finding catalog matches.
import { randomUUID } from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { File } from 'expo-file-system';
import { optionalNative } from '../reader/nativeArchive';
import { decodeBase64 } from '../reader/guided/panels';
import { readShelf, shelfIsVertical, type ReadPass, type SpineBook, type SpineLine } from './spines';
import { decide, rankCandidates, type CatalogIndex } from './candidates';
import { draftDir, draftPhoto } from './draft';
import type { Detected } from './session';

/** The photo is brought to this width before reading: big enough for small lettering, small enough to be quick. */
const WORK_WIDTH = 2600;
/** The picture used to find the edges between books. */
const EDGE_WIDTH = 640;

export type ScanStage = 'detecting' | 'reading' | 'spines' | 'matching';
export type ShelfScan = { photoUri: string; photoWidth: number; photoHeight: number; detected: Detected[] };

/** The spine picture longer than this many pixels is read as it is; a smaller one is enlarged first, since small lettering is read poorly. */
const SPINE_READ_LENGTH = 1400;
/** Beyond this many books the second reading of every spine is skipped, to keep a big photo quick. */
const MAX_SPINES_READ = 40;

/**
 * Read one spine on its own: turned so its lettering runs left to right (which way it runs is known from the first reading), enlarged, then read.
 * Returns the text found. This is added to what the whole-photo reading found, never used in place of it.
 */
async function readSpineCrop(cropUri: string, vertical: boolean, dir: 'down' | 'up'): Promise<string[]> {
  const native = optionalNative();
  if (!native?.recognizeLines) return [];
  const temps: string[] = [];
  try {
    // Lettering that runs down a spine needs a quarter turn anticlockwise to stand upright; lettering that runs up needs one clockwise.
    let turned = ImageManipulator.manipulate(cropUri);
    if (vertical) turned = turned.rotate(dir === 'up' ? 90 : -90);
    const upright = await turned.renderAsync();
    const sized = Math.max(upright.width, upright.height) < SPINE_READ_LENGTH ? await ImageManipulator.manipulate(upright).resize(upright.width >= upright.height ? { width: SPINE_READ_LENGTH } : { height: SPINE_READ_LENGTH }).renderAsync() : upright;
    const saved = await sized.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
    temps.push(saved.uri);
    const lines = (await native.recognizeLines(saved.uri)) as SpineLine[];
    return lines.filter((l) => (l.conf ?? 1) >= 0.4 && l.text.trim().length >= 2).map((l) => l.text.trim());
  } catch { return []; } finally { temps.forEach(drop); }
}

const drop = (uri: string | null) => { try { if (uri) { const f = new File(uri); if (f.exists) f.delete(); } } catch { /* it is in the cache */ } };

/** Read the photo and list the books on it, each with a picture of its spine and its catalog candidates. The shelf photo is kept inside the scan's own folder. */
export async function scanShelfOnDevice(photoUri: string, draftId: string, index: CatalogIndex, onStage?: (stage: ScanStage, done?: number, total?: number) => void): Promise<ShelfScan> {
  const native = optionalNative();
  if (!native?.recognizeLines) throw new Error('NO_OCR');
  const temps: string[] = [];
  try {
    onStage?.('detecting');
    // A working copy: upright (the manipulator applies the camera's rotation) and at a sensible size. It becomes the scan's photo.
    const first = await ImageManipulator.manipulate(photoUri).renderAsync();
    const ctx = ImageManipulator.manipulate(photoUri);
    const work = await (await (first.width > WORK_WIDTH ? ctx.resize({ width: WORK_WIDTH }) : ctx).renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
    temps.push(work.uri);
    const photo = draftPhoto(draftId);
    if (photo.exists) photo.delete();
    await new File(work.uri).copy(photo);

    onStage?.('reading');
    const asTaken = (await native.recognizeLines(photo.uri)) as SpineLine[];
    // Spines whose text runs upward are read once the photo is turned upside down.
    const flipped = await (await ImageManipulator.manipulate(photo.uri).rotate(180).renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
    temps.push(flipped.uri);
    const upsideDown = (await native.recognizeLines(flipped.uri)) as SpineLine[];
    const passes: ReadPass[] = [{ turn: 0, lines: asTaken }, { turn: 180, lines: upsideDown }];
    let gray: { data: Uint8Array; width: number; height: number } | undefined;
    try { const g = await native.grayThumbnail?.(photo.uri, EDGE_WIDTH); if (g) gray = { data: decodeBase64(g.data), width: g.width, height: g.height }; } catch { /* the lettering alone still groups the books */ }
    const books = readShelf(passes, gray);

    // Each book is cut out of the photo (its whole spine, from the edges found in the picture), read again on its own, and then matched.
    const detected: Detected[] = [];
    const vertical = shelfIsVertical(passes.flatMap((p) => p.lines));
    for (let i = 0; i < books.length; i++) {
      const book: SpineBook = books[i];
      onStage?.('spines', i, books.length);
      const scanId = randomUUID();
      let cropUri: string | null = null;
      try {
        // A little air around the spine. This picture is for checking the match and is never a cover.
        const padX = 0.004; const padY = 0.01;
        const x = Math.max(0, book.box.x - padX); const y = Math.max(0, book.box.y - padY);
        const w = Math.min(1 - x, book.box.w + 2 * padX); const h = Math.min(1 - y, book.box.h + 2 * padY);
        const crop = await (await ImageManipulator.manipulate(photo.uri).crop({ originX: Math.round(x * work.width), originY: Math.round(y * work.height), width: Math.max(8, Math.round(w * work.width)), height: Math.max(8, Math.round(h * work.height)) }).renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
        const target = new File(draftDir(draftId), `spine-${scanId}.jpg`);
        await new File(crop.uri).move(target);
        cropUri = target.uri;
      } catch { /* the title is still useful without the picture */ }
      // The second reading of this spine, added to the first.
      const closer = cropUri && books.length <= MAX_SPINES_READ ? await readSpineCrop(cropUri, vertical, book.dir) : [];
      const rawText = closer.length ? `${book.rawText} | ${closer.join(' | ')}` : book.rawText;
      onStage?.('matching');
      const candidates = rankCandidates({ ...book, rawText }, index);
      detected.push({ scanId, box: book.box, cropUri, extractedText: rawText.split(' | '), read: { title: book.title, volume: book.volume, creators: book.creators }, candidates, decision: decide(candidates, rawText) });
    }
    return { photoUri: photo.uri, photoWidth: work.width, photoHeight: work.height, detected };
  } finally { temps.forEach(drop); }
}

/**
 * The reader drew a box around a book the scan missed. Read just that part of the photo and look for it in the catalog, so the result starts
 * with whatever can be made out (it is still theirs to correct).
 */
export async function readRegion(photoUri: string, photoWidth: number, photoHeight: number, box: { x: number; y: number; w: number; h: number }, draftId: string, index: CatalogIndex): Promise<Detected> {
  const scanId = randomUUID();
  const crop = await (await ImageManipulator.manipulate(photoUri).crop({ originX: Math.round(box.x * photoWidth), originY: Math.round(box.y * photoHeight), width: Math.max(8, Math.round(box.w * photoWidth)), height: Math.max(8, Math.round(box.h * photoHeight)) }).renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  const target = new File(draftDir(draftId), `spine-${scanId}.jpg`);
  await new File(crop.uri).move(target);
  let lines: SpineLine[] = [];
  try { lines = (await optionalNative()?.recognizeLines?.(target.uri)) ?? []; } catch { /* nothing readable: the reader will search */ }
  const book = readShelf([{ turn: 0, lines }])[0];
  const read = book ? { title: book.title, volume: book.volume, creators: book.creators } : { title: '', volume: null, creators: [] };
  const candidates = book ? rankCandidates(book, index) : [];
  return { scanId, box, cropUri: target.uri, extractedText: book ? book.rawText.split(' | ') : [], read, candidates, decision: decide(candidates, book?.rawText ?? '') };
}
