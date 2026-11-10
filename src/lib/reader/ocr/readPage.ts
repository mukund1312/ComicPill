// Reads the text on a comic page, on the device: the whole page and then overlapping tiles of it, merged and put in reading order.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { File } from 'expo-file-system';
import { optionalNative } from '../nativeArchive';
import { layoutBubbles, layoutPage, tileRects, type OcrLine, type OcrRegion } from './layout';

/** Pages smaller than this read fine whole (a screenshot, a thumbnail); tiling is for big pages with small lettering. */
const TILE_FROM_PIXELS = 1_500_000;

type PageRead = { regions: OcrRegion[]; width: number; height: number };

/** One text-recognition pass over the page (whole, then in tiles when it is big). Null where this build can't read text. */
async function readRegions(uri: string): Promise<PageRead | null> {
  const native = optionalNative();
  if (!native?.recognizeLines) return null;
  let size: { width: number; height: number };
  try { const ref = await ImageManipulator.manipulate(uri).renderAsync(); size = { width: ref.width, height: ref.height }; } catch { return null; }
  const { width, height } = size;
  const regions: OcrRegion[] = [];

  try { regions.push({ rect: { x: 0, y: 0, w: width, h: height }, lines: (await native.recognizeLines(uri)) as OcrLine[] }); } catch { /* the tiles may still read it */ }

  if (width * height >= TILE_FROM_PIXELS) {
    for (const rect of tileRects(width, height)) {
      let tmp: string | null = null;
      try {
        const piece = await (await ImageManipulator.manipulate(uri).crop({ originX: rect.x, originY: rect.y, width: rect.w, height: rect.h }).renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
        tmp = piece.uri;
        regions.push({ rect, lines: (await native.recognizeLines(tmp)) as OcrLine[] });
      } catch { /* one tile failing leaves a gap, not a failure */ }
      finally { try { if (tmp) { const f = new File(tmp); if (f.exists) f.delete(); } } catch { /* it is in the cache */ } }
    }
  }
  return regions.length === 0 ? null : { regions, width, height };
}

/**
 * The text on a page as readable paragraphs, balloon by balloon in reading order (right to left when `rtl`).
 * Returns null where this build can't read text at all, and '' where there is no text.
 */
export async function readPageText(uri: string, opts: { rtl?: boolean } = {}): Promise<string | null> {
  const native = optionalNative();
  if (!native?.recognizeText) return null;
  // An older native build only knows the plain reader: it still works, without tiles or ordering.
  if (!native.recognizeLines) { try { return await native.recognizeText(uri); } catch { return null; } }
  const read = await readRegions(uri);
  return read ? layoutPage(read.regions, read.width, read.height, { rtl: opts.rtl }).text : null;
}

/** Boxes (fractions of the page) of the balloons on a page in reading order; null where this build can't read text. */
export async function readPageBubbles(uri: string, opts: { rtl?: boolean } = {}): Promise<Array<{ x: number; y: number; w: number; h: number; lines: Array<{ x: number; y: number; w: number; h: number }> }> | null> {
  const read = await readRegions(uri);
  return read ? layoutBubbles(read.regions, read.width, read.height, { rtl: opts.rtl }) : null;
}
