// Settings. Every row does something real: switches persist and take effect,
// links open real screens, actions confirm before anything destructive, and
// permission rows show the phone's actual status and act on it.
import { useState } from 'react';
import { Share } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { SettingsPage } from '../../ui/SettingsPage';
import { ActionRow, ChoiceSheet, InfoRow, LinkRow, SettingsSection, ToggleRow, type Choice } from '../../ui/settingsUi';
import { confirm, notice } from '../../ui/dialogs';
import { useAppearance } from '../../ui/theme';
import { useProfile, useSettings } from '../../lib/state/settings';
import { useTravelMode } from '../../lib/state/travelMode';
import { pickSettings, reminderSummary } from '../../lib/settings/model';
import { exportFileName, serializeExport, summarizeExport } from '../../lib/settings/exportModel';
import { PERMISSION_COPY, STATE_LABEL, type PermissionKey } from '../../lib/platform/permissionsCore';
import { syncReminder } from '../../lib/platform/reminders';
import { feedback } from '../../lib/platform/feedback';
import { clearUserData, exportUserData } from '../../lib/db/queries/userData';
import { DEPTHS } from '../arc/useArc';
import type { ArcDepth } from '../../lib/engines/arc/types';
import { usePermissions } from './usePermissions';
import { useAiConfig } from '../../lib/ai/useAiConfig';
import { useAuth } from '../../lib/auth/auth';
import { updatesSupported } from '../../lib/update/useUpdate';
import { PROVIDER_LABEL } from '../../lib/ai/models';

type ExportChoice = 'share' | 'copy';
const PERMISSIONS: PermissionKey[] = ['camera', 'photos', 'notifications'];

export default function SettingsScreen() {
  const authEmail = useAuth((st) => st.email);
  const doSignOut = useAuth((st) => st.signOut);
  const signOut = async () => {
    const yes = await confirm({ title: 'Sign out?', message: 'Your comics and taste stay on this phone. Sign back in any time.', confirmLabel: 'Sign out' });
    if (!yes) return;
    await doSignOut();
    router.replace('/sign-in');
  };
  const { theme, typography } = useAppearance();
  const s = useSettings();
  const username = useProfile((p) => p.username);
  const digitalOnly = useTravelMode((t) => t.digitalOnly);
  const setDigitalOnly = useTravelMode((t) => t.setDigitalOnly);
  const perms = usePermissions();
  const ai = useAiConfig();

  const [sheet, setSheet] = useState<null | 'depth' | 'language' | 'currency' | 'export'>(null);
  const [exportNote, setExportNote] = useState('');
  const close = () => setSheet(null);

  const buildExport = () => {
    const p = useProfile.getState();
    const settings = useSettings.getState();
    return exportUserData(new Date(), { displayName: p.displayName, username: p.username, bio: p.bio, avatar: p.avatar, monthlyGoal: p.monthlyGoal }, pickSettings(settings));
  };

  const openExport = () => {
    try { setExportNote(`This includes ${summarizeExport(buildExport())}. Your photo is not included.`); } catch { setExportNote(''); }
    setSheet('export');
  };

  const doExport = async (how: ExportChoice) => {
    close();
    try {
      const now = new Date();
      const json = serializeExport(buildExport());
      if (how === 'copy') {
        await Clipboard.setStringAsync(json);
        feedback.success();
        notice('Copied', 'Your data is on the clipboard as JSON.');
      } else {
        await Share.share({ title: exportFileName(now), message: json });
      }
    } catch {
      notice('Couldn’t export', 'Something went wrong preparing your data. Nothing was changed.');
    }
  };

  const clearData = async () => {
    const ok = await confirm({
      title: 'Clear reading data?',
      message: 'This removes your library, reading history, playlists, journeys and wallet from this device. The comic catalog stays. It can’t be undone — export first if you want a copy.',
      confirmLabel: 'Clear data', destructive: true,
    });
    if (!ok) return;
    try {
      clearUserData();
      feedback.warning();
      notice('Cleared', 'Your reading data has been removed from this device.');
    } catch {
      notice('Couldn’t clear data', 'Something went wrong, so nothing was removed.');
    }
  };

  const resetSettings = async () => {
    if (!await confirm({ title: 'Reset settings?', message: 'This puts every setting on this page back to its default, and turns off your reminder. Your library and profile are not affected.', confirmLabel: 'Reset', destructive: true })) return;
    useSettings.getState().reset();
    setDigitalOnly(false);
    await syncReminder({ remindersEnabled: false, reminderHour: 20, reminderMinute: 0 }, null).catch(() => undefined);
    feedback.success();
  };

  const depthLabel = DEPTHS.find((d) => d.id === s.defaultJourneyDepth)?.label ?? 'Recommended';
  const depthChoices: Choice<ArcDepth>[] = DEPTHS.map((d) => ({ id: d.id, label: d.label, detail: d.blurb }));
  const permissionValue = (k: PermissionKey) => (perms.states ? STATE_LABEL[perms.states[k]] : '…');

  return (
    <SettingsPage title="Settings" subtitle="Quiet controls for the rest of your reading life." backLabel="Profile">
      <SettingsSection title="Account">
        <LinkRow label="Edit profile" value={`@${username}`} onPress={() => router.push('/edit-profile')} />
        <LinkRow label="Notifications" value={reminderSummary(s)} onPress={() => router.push('/notifications')} last />
      </SettingsSection>

      <SettingsSection title="Reading">
        <LinkRow label="Default journey depth" detail="How many books a new journey starts with." value={depthLabel} onPress={() => setSheet('depth')} />
        <ToggleRow label="Travel mode" detail="Only pick books you can open digitally." value={digitalOnly} onChange={setDigitalOnly} last />
      </SettingsSection>

      <SettingsSection title="AI assistant" footer="Optional. Add your own key to understand natural-language requests and scan shelves. Everything else works without one.">
        <LinkRow label="AI assistant" value={ai.key ? `${PROVIDER_LABEL[ai.provider]} · key saved` : 'Off'} onPress={() => router.push('/ai-settings')} last />
      </SettingsSection>

      <SettingsSection title="Privacy & data" footer="Everything you add stays on this device. ComicPill has no account. It only goes online for two things you control: your own AI key (when you tap Build my journey or Scan) and, on Android, a once-a-day check for a newer version.">
        <LinkRow label="Passcode & privacy" detail="Ask for a passcode when ComicPill opens." onPress={() => router.push('/passcode')} />
        <ToggleRow label="Personalized recommendations" detail="Use what ComicPill has learned about your taste. Off: Today and Compare treat you as a new reader." value={s.personalizedRecommendations} onChange={(v) => s.update({ personalizedRecommendations: v })} />
        {updatesSupported() ? <ToggleRow label="Check for updates" detail="Once a day, asks GitHub if a newer ComicPill exists. Sends no personal data." value={s.checkForUpdates} onChange={(v) => s.update({ checkForUpdates: v })} /> : null}
        <InfoRow label="Analytics" value="None collected" detail="This version doesn’t track your usage." />
        <ActionRow label="Export my data" detail="Get a copy of your library, history and settings." onPress={openExport} />
        <ActionRow label="Clear reading data" detail="Remove your library, history, playlists and journeys." destructive onPress={clearData} last />
      </SettingsSection>

      <SettingsSection title="Account" footer="Your account lives on this phone only.">
        <InfoRow label="Signed in as" value={authEmail ?? ''} />
        <ActionRow label="Sign out" detail="You can sign back in any time. Nothing is deleted." onPress={signOut} last />
      </SettingsSection>

      <SettingsSection title="Permissions" footer="Tap a row to allow it, or to change it in your phone’s Settings.">
        {PERMISSIONS.map((k, i) => (
          <LinkRow key={k} label={PERMISSION_COPY[k].title} detail={PERMISSION_COPY[k].why} value={permissionValue(k)} onPress={() => { void perms.activate(k); }} last={i === PERMISSIONS.length - 1} />
        ))}
      </SettingsSection>

      <SettingsSection title="App">
        <LinkRow label="Appearance" value={`${theme.name} · ${typography.name}`} onPress={() => router.push('/appearance')} />
        <LinkRow label="Language" value="English" onPress={() => setSheet('language')} />
        <LinkRow label="Currency" value="₹ INR" onPress={() => setSheet('currency')} />
        <LinkRow label="Accessibility" onPress={() => router.push('/accessibility')} last />
      </SettingsSection>

      <SettingsSection title="Support">
        <LinkRow label="Help & feedback" onPress={() => router.push('/feedback')} />
        <LinkRow label="Sources & metadata" onPress={() => router.push('/sources')} />
        <LinkRow label="Edit my taste picks" detail="Characters, art, genres and story feel." onPress={() => router.push('/onboarding?mode=edit')} />
        <LinkRow label="About ComicPill" onPress={() => router.push('/about')} last />
      </SettingsSection>

      <SettingsSection>
        <ActionRow label="Reset settings" detail="Put everything on this page back to its default." destructive onPress={resetSettings} last />
      </SettingsSection>

      <ChoiceSheet<ArcDepth> visible={sheet === 'depth'} title="Default journey depth" message="Applies when you build a new journey. You can still change it each time." choices={depthChoices} selected={s.defaultJourneyDepth} onSelect={(id) => { s.update({ defaultJourneyDepth: id }); close(); }} onClose={close} />
      <ChoiceSheet<'en'> visible={sheet === 'language'} title="Language" choices={[{ id: 'en', label: 'English' }]} selected="en" onSelect={close} onClose={close} footnote="English is the only language available in this version." />
      <ChoiceSheet<'inr'> visible={sheet === 'currency'} title="Currency" choices={[{ id: 'inr', label: 'Indian rupee (₹)', detail: 'Prices in the catalog are Indian-market prices.' }]} selected="inr" onSelect={close} onClose={close} footnote="Other currencies need live exchange rates, which ComicPill doesn’t have yet — so it won’t show converted prices that could be wrong." />
      <ChoiceSheet<ExportChoice> visible={sheet === 'export'} title="Export my data" message={exportNote} choices={[{ id: 'share', label: 'Share…', detail: 'Send it to Files, Notes, email or another app.' }, { id: 'copy', label: 'Copy to clipboard' }]} onSelect={doExport} onClose={close} />
    </SettingsPage>
  );
}
