// Keeps the OS notification schedule matching the reader's settings: on
// launch, and whenever they change. Renders nothing.
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSettings } from '../../lib/state/settings';
import { configureNotifications, syncReminder } from '../../lib/platform/reminders';
import { nextJourneyTitle } from '../../lib/db/queries/arc';

export default function ReminderSync() {
  const enabled = useSettings((s) => s.remindersEnabled);
  const hour = useSettings((s) => s.reminderHour);
  const minute = useSettings((s) => s.reminderMinute);

  useEffect(() => { void configureNotifications().catch(() => undefined); }, []);

  useEffect(() => {
    const sync = () => { void syncReminder({ remindersEnabled: enabled, reminderHour: hour, reminderMinute: minute }, enabled ? nextJourneyTitle() : null).catch(() => undefined); };
    sync();
    // The reminder names the next book in the journey; refresh that text
    // whenever the app comes back to the foreground.
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') sync(); });
    return () => sub.remove();
  }, [enabled, hour, minute]);

  return null;
}
