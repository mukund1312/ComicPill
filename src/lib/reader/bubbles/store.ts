// Balloons found on a page (or corrected by the reader) are kept in the app's database, so a page is only ever read once.
// A reader's own corrections are marked `edited` and are never replaced by a fresh detection.
import { getMeta, setMeta } from '../../db/queries/meta';
import type { Bubble } from './bubbles';

/** Bump when the detector changes enough that old automatic results should be redone. */
const VERSION = 19;
const key = (comicId: string, page: number, rtl: boolean) => `bubbles:v${VERSION}:${comicId}:${page}:${rtl ? 'r' : 'l'}`;

export type StoredBubbles = { list: Bubble[]; edited: boolean };

export function loadBubbles(comicId: string, page: number, rtl: boolean): StoredBubbles | null {
  try {
    const raw = getMeta(key(comicId, page, rtl));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredBubbles;
    return Array.isArray(parsed.list) ? parsed : null;
  } catch { return null; }
}

export function storeBubbles(comicId: string, page: number, rtl: boolean, value: StoredBubbles): void {
  try { setMeta(key(comicId, page, rtl), JSON.stringify(value)); } catch { /* a cache that cannot be written is just a cache that is empty */ }
}
