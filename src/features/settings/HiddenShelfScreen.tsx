// Settings → Hidden shelf: set it up, change its password, turn it off, or start over after forgetting the password.
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SettingsPage } from '../../ui/SettingsPage';
import { ActionRow, InfoRow, SettingsSection, TextField, ToggleRow } from '../../ui/settingsUi';
import { Button } from '../../ui/primitives';
import { useAppearance } from '../../ui/theme';
import { space } from '../../ui/tokens';
import { feedback } from '../../lib/platform/feedback';
import { askToUseBiometrics, biometricName, biometricsAvailable } from '../../lib/platform/biometrics';
import {
  changeHiddenShelfPassword, countHiddenComics, hiddenShelfReady, hiddenShelfUsesBiometrics, setHiddenShelfBiometrics, markHiddenShelfAsked, newPasswordProblem, resetHiddenShelf, setUpHiddenShelf, turnOffHiddenShelf,
} from '../../lib/reader/hiddenShelf';
import { onMyDevice } from '../../lib/platform/device';

type Form = null | 'setup' | 'change' | 'off';

export default function HiddenShelfScreen() {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const [ready, setReady] = useState(hiddenShelfReady);
  const [count, setCount] = useState(0);
  const [form, setForm] = useState<Form>(null);
  const [current, setCurrent] = useState(''); const [pw, setPw] = useState(''); const [again, setAgain] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [bioName, setBioName] = useState<string | null>(null);
  const [useBio, setUseBio] = useState(hiddenShelfUsesBiometrics);
  useEffect(() => { let live = true; void biometricsAvailable().then(async (ok) => { if (ok && live) setBioName(await biometricName()); }); return () => { live = false; }; }, []);
  const reload = useCallback(() => { setReady(hiddenShelfReady()); setCount(countHiddenComics()); setUseBio(hiddenShelfUsesBiometrics()); }, []);
  useFocusEffect(reload);

  const openForm = (f: Form) => { setForm(f); setCurrent(''); setPw(''); setAgain(''); setError(undefined); };
  const fail = (message: string) => { feedback.warning(); setError(message); };

  const save = async () => {
    if (form === 'off') {
      if (!(await turnOffHiddenShelf(current))) { fail('That isn’t the current password.'); return; }
      feedback.success(); openForm(null); reload();
      Alert.alert('Hidden shelf turned off', `${count} ${count === 1 ? 'comic is' : 'comics are'} back on ${onMyDevice()}.`);
      return;
    }
    const problem = newPasswordProblem(pw, again);
    if (problem) { fail(problem); return; }
    if (form === 'change') {
      if (!(await changeHiddenShelfPassword(current, pw))) { fail('That isn’t the current password.'); return; }
      feedback.success(); openForm(null); Alert.alert('Password changed', 'Use the new one next time you open the hidden shelf.');
      return;
    }
    await setUpHiddenShelf(pw);
    setHiddenShelfBiometrics(await askToUseBiometrics('the hidden shelf'));
    feedback.success(); openForm(null); reload();
  };

  const forgot = () => Alert.alert('Forgot the password?', `It can’t be recovered. Starting over deletes the ${count} ${count === 1 ? 'comic' : 'comics'} on the hidden shelf from this device; then you can choose a new password.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete and start over', style: 'destructive', onPress: () => { resetHiddenShelf(); feedback.warning(); reload(); openForm('setup'); } },
  ]);

  const formTitle = form === 'setup' ? 'Choose a password' : form === 'change' ? 'Change the password' : 'Turn off the hidden shelf';
  const formBody = form ? (
    <SettingsSection title={formTitle} footer={form === 'off' ? 'Every hidden comic goes back to your normal shelf, and the password is forgotten.' : 'At least 4 characters. It can’t be recovered if you forget it.'}>
      <View style={styles.form}>
        {form !== 'setup' ? <TextField label="Current password" value={current} onChangeText={(t) => { setCurrent(t); setError(undefined); }} secure autoCapitalize="none" autoCorrect={false} /> : null}
        {form !== 'off' ? (
          <>
            <TextField label="New password" value={pw} onChangeText={(t) => { setPw(t); setError(undefined); }} secure autoCapitalize="none" autoCorrect={false} />
            <TextField label="Type it again" value={again} onChangeText={(t) => { setAgain(t); setError(undefined); }} secure autoCapitalize="none" autoCorrect={false} error={error} />
          </>
        ) : error ? <Text style={[styles.error, { color: c.error, fontFamily: typography.bodyMedium }]}>{error}</Text> : null}
        <Button kind={form === 'off' ? 'destructive' : 'primary'} onPress={() => { void save(); }} disabled={form === 'off' ? !current : !pw || !again || (form === 'change' && !current)}>
          {form === 'setup' ? 'Create hidden shelf' : form === 'change' ? 'Change password' : 'Turn off'}
        </Button>
        <Button kind="ghost" onPress={() => openForm(null)}>Cancel</Button>
      </View>
    </SettingsSection>
  ) : null;

  return (
    <SettingsPage title="Hidden shelf" subtitle={`A second shelf on ${onMyDevice()} with a password of its own. Comics on it don’t show up on your shelf, in folders, Reading now or search.`}>
      <SettingsSection title="How to open it">
        <View style={styles.how}>
          <Text style={[styles.howText, { color: c.textSecondary, fontFamily: typography.body }]}>{`1. Go to Library → ${onMyDevice()}.`}</Text>
          <Text style={[styles.howText, { color: c.textSecondary, fontFamily: typography.body }]}>2. Swipe the shelf from right to left. The hidden shelf slides in halfway.</Text>
          <Text style={[styles.howText, { color: c.textSecondary, fontFamily: typography.body }]}>3. Type the password and it opens fully.</Text>
          <Text style={[styles.howText, { color: c.textSecondary, fontFamily: typography.body }]}>{'To hide a comic, long-press it on the shelf and choose “Move to hidden shelf”. It locks again whenever you leave the app.'}</Text>
        </View>
      </SettingsSection>

      {form ? formBody : ready ? (
        <SettingsSection title="Your hidden shelf" footer="This keeps comics out of sight; it doesn’t encrypt the files.">
          <InfoRow label="Status" value="On" />
          <InfoRow label="Hidden comics" value={String(count)} />
          <ActionRow label="Open it now" detail={`Takes you to ${onMyDevice()}. Swipe from right to left.`} onPress={() => router.push('/reader/phone')} />
          {bioName ? <ToggleRow label={`Open with ${bioName}`} detail="Off: only the password opens it." value={useBio} onChange={(v) => { setHiddenShelfBiometrics(v); setUseBio(v); }} /> : null}
          <ActionRow label="Change password" onPress={() => openForm('change')} />
          <ActionRow label="Forgot the password" detail="Deletes the hidden comics and lets you start over." onPress={forgot} />
          <ActionRow label="Turn off hidden shelf" detail="Moves every hidden comic back to your shelf." destructive onPress={() => openForm('off')} last />
        </SettingsSection>
      ) : (
        <SettingsSection title="Not set up">
          <ActionRow label="Set up hidden shelf" detail="Choose a password to get started." onPress={() => { markHiddenShelfAsked(); openForm('setup'); }} last />
        </SettingsSection>
      )}
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  form: { padding: space.lg, gap: space.md },
  how: { padding: space.lg, gap: space.sm },
  howText: { fontSize: 14, lineHeight: 21 },
  error: { fontSize: 14 },
});
