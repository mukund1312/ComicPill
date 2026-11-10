import { optionalNative } from '../nativeArchive';
import { clearCachedPanels, getCachedPanels, saveCachedPanels } from '../readerLibrary';
import { decodeBase64, detectPanels, FULL_PAGE, type Panel } from './panels';

const THUMB_WIDTH = 200;
/** Bump when the detector gets better, so pages read by an older one are read again. */
const DETECTOR_VERSION = 2;

export const guidedAvailable = (): boolean => !!optionalNative()?.grayThumbnail;

/** Panels for one page: cached per page in the database, detected on first sight. Never throws — falls back to the whole page. */
export async function detectPagePanels(comicId: string, page: number, uri: string, rtl: boolean): Promise<Panel[]> {
  const cached = getCachedPanels(comicId, page);
  if (cached && (cached.edited || (cached.v === DETECTOR_VERSION && cached.rtl === rtl))) return cached.panels;
  const native = optionalNative();
  if (!native?.grayThumbnail) return [FULL_PAGE];
  try {
    const thumb = await native.grayThumbnail(uri, THUMB_WIDTH);
    const panels = detectPanels(decodeBase64(thumb.data), thumb.width, thumb.height, { rtl });
    saveCachedPanels(comicId, page, { rtl, panels, v: DETECTOR_VERSION });
    return panels;
  } catch {
    return [FULL_PAGE];
  }
}

/** The reader's own panels for a page (drawn, moved or removed by hand). Kept for good; automatic detection never replaces them. */
export function saveEditedPanels(comicId: string, page: number, rtl: boolean, panels: Panel[]): void {
  saveCachedPanels(comicId, page, { rtl, panels, v: DETECTOR_VERSION, edited: true });
}

/** Forget a page's panels (edited or not) so it is detected afresh next time. */
export function resetPagePanels(comicId: string, page: number): void {
  clearCachedPanels(comicId, page);
}
