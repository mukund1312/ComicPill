// Notifications: the phone's permission, and one real thing to turn on — a
// daily reading reminder scheduled with the OS. "Send a test" proves it works.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Pill } from '../../ui/primitives';
import { SettingsPage } from '../../ui/SettingsPage';
import { SettingsSection, ToggleRow } from '../../ui/settingsUi';
import { notice } from '../../ui/dialogs';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { useSettings } from '../../lib/state/settings';
import { formatReminderTime, REMINDER_PRESETS, shiftTime } from '../../lib/settings/model';
import { NOTIFICATIONS_UNAVAILABLE_MESSAGE, STATE_LABEL } from '../../lib/platform/permissionsCore';
import { sendTestNotification, syncReminder } from '../../lib/platform/reminders';
import { nextJourneyTitle } from '../../lib/db/queries/arc';
import { usePermissions } from './usePermissions';

export default function NotificationsScreen() {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const s = useSettings();
  const perms = usePermissions();
  const [busy, setBusy] = useState(false);
  const state = perms.states?.notifications ?? null;
  const allowed = state === 'granted';
  const unavailable = state === 'unavailable';

  /** Make the OS schedule match what the settings now say. */
  const reschedule = async () => {
    const latest = useSettings.getState();
    try { await syncReminder(latest, nextJourneyTitle()); }
    catch { notice('Couldn’t schedule the reminder', 'Something went wrong talking to your phone’s notifications. Try again.'); }
  };

  const setEnabled = async (on: boolean) => {
    if (on && !(await perms.ensure('notifications'))) return; // explains and offers Settings itself
    s.update({ remindersEnabled: on });
    await reschedule();
  };

  const setTime = async (hour: number, minute: number) => {
    s.update({ reminderHour: hour, reminderMinute: minute });
    if (useSettings.getState().remindersEnabled) await reschedule();
  };

  const nudge = (deltaMinutes: number) => {
    const t = shiftTime(s.reminderHour, s.reminderMinute, deltaMinutes);
    void setTime(t.hour, t.minute);
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      if (!allowed && !(await perms.ensure('notifications'))) return;
      const sent = await sendTestNotification();
      notice(sent ? 'Sent' : 'Not sent', sent ? 'It should arrive in a few seconds.' : 'Notifications aren’t allowed for ComicPill.');
    } catch {
      notice('Couldn’t send it', 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsPage title="Notifications" subtitle="Useful prompts, never noise." backLabel="Settings">
      <SettingsSection title="Permission">
        <View style={styles.permission}>
          <Text style={[styles.permissionState, { color: allowed ? c.success : c.warning, fontFamily: typography.bodySemibold }]}>
            {state ? STATE_LABEL[state] : 'Checking…'}
          </Text>
          <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>
            {unavailable ? NOTIFICATIONS_UNAVAILABLE_MESSAGE : allowed ? 'ComicPill can send you your reading reminder.' : 'ComicPill needs your permission before it can send reminders.'}
          </Text>
          {!allowed && !unavailable && state ? <Button kind="secondary" onPress={() => { void perms.activate('notifications'); }}>{state === 'blocked' ? 'Open Settings' : 'Allow notifications'}</Button> : null}
        </View>
      </SettingsSection>

      <SettingsSection title="Reading reminder" footer="One gentle notification a day, at the time you choose. It names your next book when you're on a journey.">
        <ToggleRow label="Daily reading reminder" disabled={unavailable} value={s.remindersEnabled && !unavailable} onChange={(v) => { void setEnabled(v); }} last={!s.remindersEnabled || unavailable} />
        {s.remindersEnabled && !unavailable ? (
          <View style={styles.time}>
            <View style={styles.stepRow}>
              <Button kind="secondary" style={styles.step} onPress={() => nudge(-15)}>−15m</Button>
              <Text accessibilityLiveRegion="polite" style={[styles.timeText, { color: c.textPrimary, fontFamily: typography.display }]}>{formatReminderTime(s.reminderHour, s.reminderMinute)}</Text>
              <Button kind="secondary" style={styles.step} onPress={() => nudge(15)}>+15m</Button>
            </View>
            <View style={styles.presets}>
              {REMINDER_PRESETS.map((p) => (
                <Pill key={p.label} label={`${p.label} · ${formatReminderTime(p.hour, p.minute)}`} active={s.reminderHour === p.hour && s.reminderMinute === p.minute} onPress={() => { void setTime(p.hour, p.minute); }} />
              ))}
            </View>
          </View>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Try it" footer="Sends one notification in a few seconds so you can see what a reminder looks like.">
        <View style={styles.permission}>
          <Button kind="secondary" onPress={sendTest} disabled={busy || unavailable}>{busy ? 'Sending…' : 'Send a test notification'}</Button>
        </View>
      </SettingsSection>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  permission: { padding: space.md, gap: 8 },
  permissionState: { fontSize: 16 },
  body: { fontSize: 14, lineHeight: 20 },
  time: { padding: space.md, gap: space.md },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  step: { minWidth: 76, paddingHorizontal: 8 },
  timeText: { fontSize: 30 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
