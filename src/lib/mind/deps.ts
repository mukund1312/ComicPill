// The real thing wired to the phone: SQLite, the reader's own AI key, ML Kit, the comic databases.
import { getAiConfig, useKeyStore } from '../ai/keyStore';
import { useSettings } from '../state/settings';
import { prepareForScan } from '../scan/prepare';
import { recognizeText } from './capture/ocr';
import { searchCatalog } from './catalogDb';
import type { Deps } from './pipeline';
import { loadComicVineKey } from './settings';
import { sqliteStore } from './sqliteStore';

/** Everything the pipeline needs, with keys loaded. Works from the foreground and from the background task. */
export async function makeDeps(): Promise<Deps> {
  try { await (useSettings as unknown as { persist?: { rehydrate?: () => Promise<void> | void } }).persist?.rehydrate?.(); } catch { /* already hydrated */ }
  await useKeyStore.getState().load();
  const comicVineKey = await loadComicVineKey();
  return {
    store: sqliteStore,
    ai: getAiConfig(),
    comicVineKey,
    searchLocal: (title) => searchCatalog(title),
    // Re-encoding at 1280px strips EXIF, GPS included, before anything is uploaded.
    prepare: async (uri) => (await prepareForScan([uri]))[0] ?? null,
    ocr: recognizeText,
    now: () => Date.now(),
  };
}
