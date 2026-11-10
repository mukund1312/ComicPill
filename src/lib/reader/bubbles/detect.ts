import { optionalNative } from '../nativeArchive';
import { decodeBase64 } from '../guided/panels';
import { readPageBubbles } from '../ocr/readPage';
import { toBubbles, type Bubble } from './bubbles';
import { bubblesFromDetections } from './fromModel';
import { loadBubbles, storeBubbles } from './store';

const memory = new Map<string, Bubble[]>();
const inFlight = new Map<string, Promise<Bubble[]>>();
const KEEP = 24;
const THUMB_WIDTH = 800;
const k = (comicId: string, page: number, rtl: boolean) => `${comicId}:${page}:${rtl ? 'r' : 'l'}`;

function remember(key: string, list: Bubble[]) {
  memory.set(key, list);
  if (memory.size > KEEP) memory.delete(memory.keys().next().value as string);
}

/**
 * Balloons on one page. Answered from memory, then from the database; only a page never seen before is read (on the device, in the
 * background), and the answer is kept for good. Empty when none are found or this build can't read text.
 */
export function detectPageBubbles(comicId: string, page: number, uri: string, rtl: boolean): Promise<Bubble[]> {
  const key = k(comicId, page, rtl);
  const hit = memory.get(key);
  if (hit) return Promise.resolve(hit);
  const stored = loadBubbles(comicId, page, rtl);
  if (stored) { remember(key, stored.list); return Promise.resolve(stored.list); }
  const running = inFlight.get(key);
  if (running) return running;
  const job = (async () => {
    let found: Bubble[] = [];
    try {
      // The neural detector first (it draws the whole balloon); the text-based method when this build does not have it, or it finds nothing.
      const model = optionalNative()?.detectBubbles;
      let modelBubbles: Bubble[] = [];
      if (model) { try { modelBubbles = bubblesFromDetections(await model(uri, 0.4), rtl); } catch { /* fall back to the text reader */ } }
      if (modelBubbles.length > 0) { found = modelBubbles; storeBubbles(comicId, page, rtl, { list: found, edited: false }); remember(key, found); return found; }
      const boxes = (await readPageBubbles(uri, { rtl })) ?? [];
      let gray: { data: Uint8Array; width: number; height: number } | undefined;
      try { const t = await optionalNative()?.grayThumbnail?.(uri, THUMB_WIDTH); if (t) gray = { data: decodeBase64(t.data), width: t.width, height: t.height }; } catch { /* pad instead */ }
      found = toBubbles(boxes, gray);
      storeBubbles(comicId, page, rtl, { list: found, edited: false });
    } catch { /* manual picking still works */ }
    remember(key, found);
    return found;
  })().finally(() => { inFlight.delete(key); });
  inFlight.set(key, job);
  return job;
}

/** The reader's own correction of a page (a balloon added, moved or removed). Kept for good and never overwritten by detection. */
export function saveCorrectedBubbles(comicId: string, page: number, rtl: boolean, list: Bubble[]): void {
  remember(k(comicId, page, rtl), list);
  storeBubbles(comicId, page, rtl, { list, edited: true });
}
