import { optionalNative } from '../nativeArchive';
import { getCachedPanels, saveCachedPanels } from '../readerLibrary';
import { decodeBase64, detectPanels, FULL_PAGE, type Panel } from './panels';

const THUMB_WIDTH = 200;

export const guidedAvailable = (): boolean => !!optionalNative()?.grayThumbnail;

/** Panels for one page: cached per page in the database, detected on first sight. Never throws — falls back to the whole page. */
export async function detectPagePanels(comicId: string, page: number, uri: string, rtl: boolean): Promise<Panel[]> {
  const cached = getCachedPanels(comicId, page);
  if (cached && cached.rtl === rtl) return cached.panels;
  const native = optionalNative();
  if (!native?.grayThumbnail) return [FULL_PAGE];
  try {
    const thumb = await native.grayThumbnail(uri, THUMB_WIDTH);
    const panels = detectPanels(decodeBase64(thumb.data), thumb.width, thumb.height, { rtl });
    saveCachedPanels(comicId, page, { rtl, panels });
    return panels;
  } catch {
    return [FULL_PAGE];
  }
}
