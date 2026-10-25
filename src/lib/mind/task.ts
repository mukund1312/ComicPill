// Android WorkManager job (via expo-background-task): scan, gate on the phone, rebuild the digest. Imported once at
// startup so the task is defined before the OS wakes the app for it.
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { ensureSchema } from '../db/client';
import { getMindSettings } from './settings';
import { syncMind } from './sync';

export const MIND_TASK = 'comicpill-mind-space';

TaskManager.defineTask(MIND_TASK, async () => {
  try {
    ensureSchema(); // a headless wake-up has no UI to have opened the database
    await syncMind();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Keep the periodic job registered while Mind Space is on (Android's floor is 15 minutes; the OS picks the moment). */
export async function syncMindTask(): Promise<void> {
  try {
    const s = getMindSettings();
    const registered = await TaskManager.isTaskRegisteredAsync(MIND_TASK);
    const wanted = s.watching || s.digestEnabled;
    if (wanted && !registered) await BackgroundTask.registerTaskAsync(MIND_TASK, { minimumInterval: 60 });
    if (!wanted && registered) await BackgroundTask.unregisterTaskAsync(MIND_TASK);
  } catch { /* Expo Go and some emulators can't run background tasks; the app still syncs when opened */ }
}
