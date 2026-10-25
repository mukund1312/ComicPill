// Daily reading reminder, as a real local notification. Everything is
// rescheduled from scratch each time so there is never a stale or duplicate
// reminder. If this build can't do notifications at all (Expo Go on Android),
// every function says so quietly instead of crashing.
import { Platform } from 'react-native';
import type { AppSettings } from '../settings/model';
import { getNotifications } from './notificationsModule';
import { getPermission } from './permissions';
import { reminderContent } from './remindersCore';

const CHANNEL = 'reading-reminders';
const DAILY_ID = 'daily-reminder';

/** Call once at startup: show notifications while the app is open, and make
 *  sure Android has a channel to post them on. */
export async function configureNotifications(): Promise<void> {
  const N = getNotifications();
  if (!N) return;
  N.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync(CHANNEL, { name: 'Reading reminders', importance: N.AndroidImportance.DEFAULT }).catch(() => undefined);
  }
}

export type SyncResult = 'scheduled' | 'cancelled' | 'no_permission' | 'unavailable';

/** Make the OS schedule match the settings. Safe to call any time. */
export async function syncReminder(
  s: Pick<AppSettings, 'remindersEnabled' | 'reminderHour' | 'reminderMinute'>,
  nextTitle: string | null,
): Promise<SyncResult> {
  const N = getNotifications();
  if (!N) return 'unavailable';
  // Only this reminder: other features (the weekly Mind Space digest) schedule their own.
  await N.cancelScheduledNotificationAsync(DAILY_ID).catch(() => undefined);
  if (!s.remindersEnabled) return 'cancelled';
  if ((await getPermission('notifications')) !== 'granted') return 'no_permission';

  await N.scheduleNotificationAsync({
    identifier: DAILY_ID,
    content: reminderContent(nextTitle),
    trigger: { type: N.SchedulableTriggerInputTypes.DAILY, hour: s.reminderHour, minute: s.reminderMinute, channelId: CHANNEL },
  });
  return 'scheduled';
}

/** Fires in a few seconds so the reader can see it working right now. */
export async function sendTestNotification(): Promise<boolean> {
  const N = getNotifications();
  if (!N || (await getPermission('notifications')) !== 'granted') return false;
  await N.scheduleNotificationAsync({
    content: { title: 'ComicPill', body: 'Reminders are working. This is what they look like.' },
    trigger: { type: N.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3, channelId: CHANNEL },
  });
  return true;
}
