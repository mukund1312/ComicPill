// Fetches the manifest at most once a day (or on demand) and compares it with
// the installed version. Everything that can fail returns null: an update
// check must never bother the reader with an error.
import { parseManifest, shouldCheck, updateStatus, UPDATE_MANIFEST_URL, type UpdateStatus } from './manifest';

export interface KeyValueStorage { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void> }
export type UpdateFetch = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

const LAST_CHECK_KEY = '@comicpill/update/lastCheck';
const DISMISSED_KEY = '@comicpill/update/dismissed';

export interface CheckOptions { storage: KeyValueStorage; fetchImpl?: UpdateFetch; now?: Date; force?: boolean; timeoutMs?: number }

/** Returns the status, or null if it was skipped (too soon) or could not be determined. */
export async function checkForUpdate(current: string, opts: CheckOptions): Promise<UpdateStatus | null> {
  const now = opts.now ?? new Date();
  try {
    if (!opts.force && !shouldCheck(await opts.storage.getItem(LAST_CHECK_KEY), now)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
    try {
      const doFetch = opts.fetchImpl ?? (fetch as unknown as UpdateFetch);
      // `no-cache` so a freshly published release isn't hidden behind a cached copy of the manifest.
      const res = await doFetch(UPDATE_MANIFEST_URL, { signal: controller.signal, headers: { 'cache-control': 'no-cache' } });
      if (!res.ok) return null;
      const manifest = parseManifest(await res.json());
      if (!manifest) return null;
      await opts.storage.setItem(LAST_CHECK_KEY, now.toISOString());
      return updateStatus(current, manifest);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/** The reader can dismiss one specific version; a NEWER one shows again. "Required" is never dismissible. */
export async function isDismissed(latest: string, storage: KeyValueStorage): Promise<boolean> {
  try { return (await storage.getItem(DISMISSED_KEY)) === latest; } catch { return false; }
}
export async function dismissVersion(latest: string, storage: KeyValueStorage): Promise<void> {
  try { await storage.setItem(DISMISSED_KEY, latest); } catch { /* not worth surfacing */ }
}
