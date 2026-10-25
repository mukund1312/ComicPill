// The weekly digest notification: one a week, on the day and time the reader picks, nothing else by default.
// Rescheduled whenever the digest is rebuilt so its text is never stale.
import { Platform } from 'react-native';
import { getNotifications } from '../platform/notificationsModule';
import { getPermission } from '../platform/permissions';
import type { Digest } from './engine/digest';
import type { MindSettings } from './settings';

const ID = 'mind-digest';
const CHANNEL = 'weekly-digest';

export async function syncDigestNotification(s: Pick<MindSettings, 'digestEnabled' | 'digestDay' | 'digestHour' | 'digestMinute'>, digest: Digest | null): Promise<'scheduled' | 'cancelled' | 'no_permission' | 'unavailable'> {
  const N = getNotifications();
  if (!N) return 'unavailable';
  await N.cancelScheduledNotificationAsync(ID).catch(() => undefined);
  if (!s.digestEnabled) return 'cancelled';
  if ((await getPermission('notifications')) !== 'granted') return 'no_permission';
  if (Platform.OS === 'android') await N.setNotificationChannelAsync(CHANNEL, { name: 'Weekly reading plan', importance: N.AndroidImportance.DEFAULT }).catch(() => undefined);
  const body = digest && digest.cards.length + digest.upNext.length > 0 ? digest.headline : 'Your reading plan is ready — open Mind Space to see this week’s finds.';
  await N.scheduleNotificationAsync({
    identifier: ID,
    content: { title: 'Your reading week', body: body.slice(0, 180), data: { route: '/mind/digest' } },
    // expo-notifications weekdays run 1 (Sunday) to 7 (Saturday).
    trigger: { type: N.SchedulableTriggerInputTypes.WEEKLY, weekday: s.digestDay + 1, hour: s.digestHour, minute: s.digestMinute, channelId: CHANNEL },
  });
  return 'scheduled';
}
