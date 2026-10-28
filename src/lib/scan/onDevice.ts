// Scan a photo of a shelf entirely on the device: no account, no key, nothing uploaded.
import { randomUUID } from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { Directory, File, Paths } from 'expo-file-system';
import { optionalNative } from '../reader/nativeArchive';
import { readShelf, type ReadPass, type SpineBook, type SpineLine } from './spines';

/** One comic found on a shelf, with a picture of its spine. */
export type ShelfFind = SpineBook & { cropUri: string | null; photo: number };

/** Photos are brought to this width before reading: big enough for small lettering, small enough to be quick. */
const WORK_WIDTH = 2600;
const scansDir = () => new Directory(Paths.document, 'scans');

const drop = (uri: string | null) => { try { if (uri) { const f = new File(uri); if (f.exists) f.delete(); } } catch { /* it is in the cache */ } };

/** Read every photo and list the comics on the shelves in them. Throws if this build can't read text. */
export async function scanShelfOnDevice(photoUris: string[], onProgress?: (note: string) => void): Promise<ShelfFind[]> {
  const native = optionalNative();
  if (!native?.recognizeLines) throw new Error('NO_OCR');
  const out: ShelfFind[] = [];
  for (let i = 0; i < photoUris.length; i++) {
    onProgress?.(photoUris.length > 1 ? `Reading photo ${i + 1} of ${photoUris.length}…` : 'Reading the spines…');
    const temps: string[] = [];
    try {
      // A working copy: upright (the manipulator applies the camera's rotation) and at a sensible size.
      const first = await ImageManipulator.manipulate(photoUris[i]).renderAsync();
      const ctx = ImageManipulator.manipulate(photoUris[i]);
      const work = await (await (first.width > WORK_WIDTH ? ctx.resize({ width: WORK_WIDTH }) : ctx).renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
      temps.push(work.uri);
      const asTaken = (await native.recognizeLines(work.uri)) as SpineLine[];
      // Spines whose text runs upward are read once the photo is turned upside down.
      const flipped = await (await ImageManipulator.manipulate(work.uri).rotate(180).renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
      temps.push(flipped.uri);
      const upsideDown = (await native.recognizeLines(flipped.uri)) as SpineLine[];
      const passes: ReadPass[] = [{ turn: 0, lines: asTaken }, { turn: 180, lines: upsideDown }];

      const dir = scansDir();
      if (!dir.exists) dir.create({ intermediates: true });
      for (const book of readShelf(passes)) {
        let cropUri: string | null = null;
        try {
          // A little air around the spine, then keep a picture of it: it helps to check the title, and is the cover if the catalog has none.
          const padX = 0.004; const padY = 0.01;
          const x = Math.max(0, book.box.x - padX); const y = Math.max(0, book.box.y - padY);
          const w = Math.min(1 - x, book.box.w + 2 * padX); const h = Math.min(1 - y, book.box.h + 2 * padY);
          const crop = await (await ImageManipulator.manipulate(work.uri).crop({ originX: Math.round(x * work.width), originY: Math.round(y * work.height), width: Math.max(8, Math.round(w * work.width)), height: Math.max(8, Math.round(h * work.height)) }).renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
          const target = new File(dir, `${randomUUID()}.jpg`);
          await new File(crop.uri).move(target);
          cropUri = target.uri;
        } catch { /* the title is still useful without the picture */ }
        out.push({ ...book, cropUri, photo: i });
      }
    } finally { temps.forEach(drop); }
  }
  return out;
}
