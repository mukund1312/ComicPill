// Settings. Every row does something real: switches persist and take effect,
// links open real screens, actions confirm before anything destructive, and
// permission rows show the phone's actual status and act on it.
import { useState } from 'react';
import { Share } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { SettingsPage } from '../../ui/SettingsPage';
import { useLayout } from '../../ui/layout';
import { useSidebar } from '../../lib/state/sidebar';
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
import { hiddenShelfReady } from '../../lib/reader/hiddenShelf';
import { PROVIDER_LABEL } from '../../lib/ai/models';

type ExportChoice = 'share' | 'copy';
const PERMISSIONS: PermissionKey[] = ['camera', 'photos', 'notifications'];

export default function SettingsScreen() {
  const authEmail = useAuth((st) => st.email);
  const doSignOut = useAuth((st) => st.signOut);
  const removeAccount = useAuth((st) => st.removeAccount);
  const deleteAccount = async () => {
    const yes = await confirm({
      title: 'Delete your account?',
      message: 'This removes your email and password from this phone. ComicPill keeps working without an account, and your comics and reading data stay unless you clear them next.',
      confirmLabel: 'Delete account', destructive: true,
    });
    if (!yes) return;
    await removeAccount(true);
    feedback.warning();
    const wipe = await confirm({
      title: 'Also clear your reading data?',
      message: 'Removes your library, reading history, playlists, journeys and wallet from this phone. Comic files on your shelf are not touched.',
      confirmLabel: 'Clear it too', cancelLabel: 'Keep it', destructive: true,
    });
    if (wipe) { try { clearUserData(); } catch { notice('Couldn’t clear data', 'Your account is deleted, but the reading data is still here. Try Clear reading data below.'); return; } }
    notice('Account deleted', wipe ? 'Your account and reading data are gone from this phone.' : 'Your account is gone from this phone. Your library is still here.');
  };
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

  const layout = useLayout(); const menuSide = useSidebar((st) => st.side); const setMenuSide = useSidebar((st) => st.setSide); const menuOpen = useSidebar((st) => st.open); const setMenuOpen = useSidebar((st) => st.setOpen);
  const depthLabel = DEPTHS.find((d) => d.id === s.defaultJourneyDepth)?.label ?? 'Recommended';
  const depthChoices: Choice<ArcDepth>[] = DEPTHS.map((d) => ({ id: d.id, label: d.label, detail: d.blurb }));
  const permissionValue = (k: PermissionKey) => (perms.states ? STATE_LABEL[perms.states[k]] : '…');

  return (
    <SettingsPage title="Settings" subtitle="Quiet controls for the rest of your reading life." backLabel="Profile">
      <SettingsSection title="You" footer={authEmail ? 'Your account lives on this phone only. ComicPill asks for it when it opens.' : 'An account is optional. With one, ComicPill asks for your email and password when it opens. It lives only on this phone.'}>
        <LinkRow label="Edit profile" value={`@${username}`} onPress={() => router.push('/edit-profile')} />
        <LinkRow label="Notifications" value={reminderSummary(s)} onPress={() => router.push('/notifications')} />
        {authEmail ? (
          <>
            <InfoRow label="Signed in" detail={authEmail} />
            <ActionRow label="Sign out" detail="Your comics and taste stay. Sign back in any time." onPress={signOut} />
            <ActionRow label="Delete account" detail="Removes your email and password from this phone." destructive onPress={deleteAccount} last />
          </>
        ) : (
          <LinkRow label="Create an account" detail="Optional. Protect ComicPill with your email and password." onPress={() => router.push('/sign-up')} last />
        )}
      </SettingsSection>

      <SettingsSection title="Reading">
        <LinkRow label="Reader settings" detail="Reading modes, page turns, balloons and panels." onPress={() => router.push('/reader/settings')} />
        <LinkRow label="Hidden shelf" detail="Keep some comics behind a password of their own." value={hiddenShelfReady() ? 'On' : 'Off'} onPress={() => router.push('/hidden-shelf')} />
        <LinkRow label="Storage" detail="What ComicPill keeps on this device, and clearing space." onPress={() => router.push('/storage')} />
        <LinkRow label="Default journey depth" detail="How many books a new journey starts with." value={depthLabel} onPress={() => setSheet('depth')} />
        <ToggleRow label="Travel mode" detail="Only pick books you can open digitally." value={digitalOnly} onChange={setDigitalOnly} last />
      </SettingsSection>

      {layout.isTablet ? (
        <SettingsSection title="Tablet" footer="The menu sits on the right so it's under your thumb. The menu button in the corner hides and shows it.">
          <ToggleRow label="Menu on the right" detail="Turn off to keep the menu on the left." value={menuSide === 'right'} onChange={(on) => setMenuSide(on ? 'right' : 'left')} />
          <ToggleRow label="Show the menu" detail="Hide it for more room to read." value={menuOpen} onChange={setMenuOpen} last />
        </SettingsSection>
      ) : null}

      <SettingsSection title="Privacy & security" footer="Everything you add stays on this device. ComicPill only goes online when you ask it to: looking up a comic, reading from your own comic servers, using your own AI key, and on Android a daily check for a newer version.">
        <LinkRow label="Passcode" detail="Ask for a passcode when ComicPill opens." onPress={() => router.push('/passcode')} />
        <ToggleRow label="Personalized recommendations" detail="Use what ComicPill has learned about your taste. Off: Today and Compare treat you as a new reader." value={s.personalizedRecommendations} onChange={(v) => s.update({ personalizedRecommendations: v })} />
        {updatesSupported() ? <ToggleRow label="Check for updates" detail="Once a day, asks GitHub if a newer ComicPill exists. Sends no personal data." value={s.checkForUpdates} onChange={(v) => s.update({ checkForUpdates: v })} /> : null}
        <InfoRow label="Analytics" value="None collected" detail="This version doesn’t track your usage." />
        <ActionRow label="Export my data" detail="Get a copy of your library, history and settings." onPress={openExport} />
        <ActionRow label="Clear reading data" detail="Remove your library, history, playlists and journeys." destructive onPress={clearData} last />
      </SettingsSection>

      <SettingsSection title="Permissions" footer="Tap a row to allow it, or to change it in your phone’s Settings.">
        {PERMISSIONS.map((k, i) => (
          <LinkRow key={k} label={PERMISSION_COPY[k].title} detail={PERMISSION_COPY[k].why} value={permissionValue(k)} onPress={() => { void perms.activate(k); }} last={i === PERMISSIONS.length - 1} />
        ))}
      </SettingsSection>

      <SettingsSection title="App">
        <LinkRow label="Appearance" value={`${theme.name} · ${typography.name}`} onPress={() => router.push('/appearance')} />
        <LinkRow label="Accessibility" detail="Text size, motion and haptics." onPress={() => router.push('/accessibility')} />
        <LinkRow label="AI assistant" detail="Optional: your own key for natural-language requests and shelf scans." value={ai.key ? `${PROVIDER_LABEL[ai.provider]} · key saved` : 'Off'} onPress={() => router.push('/ai-settings')} />
        <LinkRow label="Language" value="English" onPress={() => setSheet('language')} />
        <LinkRow label="Currency" value="₹ INR" onPress={() => setSheet('currency')} last />
      </SettingsSection>

      <SettingsSection title="Help">
        <LinkRow label="Help & feedback" detail="Report a bug or send an idea." onPress={() => router.push('/feedback')} />
        <LinkRow label="Edit my taste picks" detail="Characters, art, genres and story feel." onPress={() => router.push('/onboarding?mode=edit')} />
        <LinkRow label="Sources & metadata" onPress={() => router.push('/sources')} />
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
