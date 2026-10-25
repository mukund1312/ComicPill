import { runStructured, type RunOptions } from '../ai/client';
import type { AiConfig, AiResult } from '../ai/types';
import { parseShelfScan, SCAN_SYSTEM_PROMPT, SCAN_USER_TEXT, shelfScanJsonSchema, type ShelfScan } from './schema';

/** Most photos we'll send in a single request (one request = one charge). */
export const MAX_PHOTOS = 4;

/** Read what's in the photos with the reader's own AI key. ONE request for all photos. */
export function scanPhotos(cfg: AiConfig | null, imagesBase64: string[], opts: RunOptions = {}): Promise<AiResult<ShelfScan>> {
  const images = imagesBase64.slice(0, MAX_PHOTOS);
  if (images.length === 0) return Promise.resolve({ ok: false, kind: 'invalid_output', message: 'There was no photo to read.' });
  return runStructured(cfg, { system: SCAN_SYSTEM_PROMPT, text: SCAN_USER_TEXT, imagesBase64: images, schema: shelfScanJsonSchema(), schemaName: 'shelf_scan', maxTokens: 3000 }, parseShelfScan, opts);
}
