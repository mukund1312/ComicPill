// One pass of Mind Space housekeeping, shared by the Inbox's "Scan now", the app coming to the foreground and the
// background task: pick up new screenshots, let the phone gate them, send what the reader approved, rebuild the digest.
import { scanNewScreenshots } from './capture/scan';
import { makeDeps } from './deps';
import { buildAndSaveDigest } from './digestDb';
import { drainQueue, gateNewScreenshot } from './pipeline';
import { getMindSettings } from './settings';
import { syncDigestNotification } from './notify';

export type SyncSummary = { newScreenshots: number; sent: number; stoppedBy: string | null };

export async function syncMind(): Promise<SyncSummary> {
  const s = getMindSettings();
  const deps = await makeDeps();
  const newScreenshots = s.watching ? await scanNewScreenshots(deps.store).catch(() => 0) : 0;
  // OCR + the privacy gate always run on the phone. Only approved screenshots (or all, with auto-send on) ever leave it.
  for (const shot of deps.store.listScreenshots().filter((x) => x.status === 'new').reverse()) await gateNewScreenshot(shot.id, deps, s.autoSend);
  const drained = await drainQueue(deps);
  const digest = buildAndSaveDigest();
  await syncDigestNotification(s, digest).catch(() => undefined);
  return { newScreenshots, sent: drained.processed, stoppedBy: drained.stoppedBy };
}
