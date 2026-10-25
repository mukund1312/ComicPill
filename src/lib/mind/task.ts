// Android WorkManager job (via expo-background-task): scan, gate on the phone, rebuild the digest. Imported once at
// startup so the task is defined before the OS wakes the app for it.
import { ensureSchema } from '../db/client';
import { getMindSettings } from './settings';
import { syncMind } from './sync';

export const MIND_TASK = 'comicpill-mind-space';

type Task = { TaskManager: typeof import('expo-task-manager'); BackgroundTask: typeof import('expo-background-task') };
/** Background tasks need native code Expo Go doesn't have; there the job is simply not scheduled and the app syncs when opened. */
function load(): Task | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return { TaskManager: require('expo-task-manager'), BackgroundTask: require('expo-background-task') } as Task;
  } catch { return null; }
}

const native = load();
native?.TaskManager.defineTask(MIND_TASK, async () => {
  try {
    ensureSchema(); // a headless wake-up has no UI to have opened the database
    await syncMind();
    return native.BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return native.BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Keep the periodic job registered while Mind Space is on (Android's floor is 15 minutes; the OS picks the moment). */
export async function syncMindTask(): Promise<void> {
  try {
    if (!native) return;
    const { TaskManager, BackgroundTask } = native;
    const s = getMindSettings();
    const registered = await TaskManager.isTaskRegisteredAsync(MIND_TASK);
    const wanted = s.watching || s.digestEnabled;
    if (wanted && !registered) await BackgroundTask.registerTaskAsync(MIND_TASK, { minimumInterval: 60 });
    if (!wanted && registered) await BackgroundTask.unregisterTaskAsync(MIND_TASK);
  } catch { /* Expo Go and some emulators can't run background tasks; the app still syncs when opened */ }
}
