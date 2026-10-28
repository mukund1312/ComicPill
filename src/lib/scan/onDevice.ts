// Scan a photo of a shelf entirely on the device: no account, no key, nothing uploaded.
// Stages (reported as they happen so the screen can show progress): detecting books → reading spine text → finding catalog matches.
import { randomUUID } from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { File } from 'expo-file-system';
import { optionalNative } from '../reader/nativeArchive';
import { decodeBase64 } from '../reader/guided/panels';
import { readShelf, type ReadPass, type SpineLine } from './spines';
import { decide, rankCandidates, type CatalogIndex } from './candidates';
import { draftDir, draftPhoto } from './draft';
import type { Detected } from './session';

/** The photo is brought to this width before reading: big enough for small lettering, small enough to be quick. */
const WORK_WIDTH = 2600;
/** The picture used to find the edges between books. */
const EDGE_WIDTH = 640;

export type ScanStage = 'detecting' | 'reading' | 'matching';
export type ShelfScan = { photoUri: string; photoWidth: number; photoHeight: number; detected: Detected[] };

const drop = (uri: string | null) => { try { if (uri) { const f = new File(uri); if (f.exists) f.delete(); } } catch { /* it is in the cache */ } };

/** Read the photo and list the books on it, each with a picture of its spine and its catalog candidates. The shelf photo is kept inside the scan's own folder. */
export async function scanShelfOnDevice(photoUri: string, draftId: string, index: CatalogIndex, onStage?: (stage: ScanStage) => void): Promise<ShelfScan> {
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

    onStage?.('matching');
    const detected: Detected[] = [];
    for (const book of books) {
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
      const candidates = rankCandidates(book, index);
      detected.push({ scanId, box: book.box, cropUri, extractedText: book.rawText.split(' | '), read: { title: book.title, volume: book.volume, creators: book.creators }, candidates, decision: decide(candidates, book.rawText) });
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
