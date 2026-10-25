import { useCallback, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { SettingsPage } from '../../ui/SettingsPage';
import { ActionRow, InfoRow, LinkRow, SettingsSection } from '../../ui/settingsUi';
import { notice } from '../../ui/dialogs';
import { installedVersion, useUpdate } from '../../lib/update/useUpdate';
import { dataSummary } from '../../lib/db/queries/userData';

export default function AboutScreen() {
  const [tick, setTick] = useState(0);
  useFocusEffect(useCallback(() => { setTick((t) => t + 1); }, []));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const summary = useMemo(() => dataSummary(), [tick]);
  const version = installedVersion();
  const update = useUpdate();

  const checkNow = async () => {
    const r = await update.checkNow();
    if (!r) notice('Couldn\u2019t check', 'ComicPill couldn\u2019t reach the update server. Try again when you\u2019re online.');
    else if (r.kind === 'up_to_date') notice('You\u2019re up to date', `ComicPill ${version} is the latest version.`);
  };

  return (
    <SettingsPage title="About ComicPill" subtitle="Better decisions. More great comics." backLabel="Settings">
      <SettingsSection title="This app">
        <InfoRow label="Version" value={version} />
        <InfoRow label="Comics in the catalog" value={String(summary.catalog)} last={!update.supported} />
        {update.supported ? <ActionRow label="Check for updates" detail={update.status && update.status.kind !== 'up_to_date' ? `Version ${update.status.latest} is available.` : undefined} onPress={checkNow} disabled={update.checking} last /> : null}
      </SettingsSection>

      <SettingsSection title="On this device" footer="Your library, history, playlists, journeys and wallet are stored only on this phone.">
        <InfoRow label="In your library" value={String(summary.inLibrary)} />
        <InfoRow label="Finished" value={String(summary.finished)} />
        <InfoRow label="Reading now" value={String(summary.reading)} />
        <InfoRow label="Playlists" value={String(summary.playlists)} />
        <InfoRow label="Journeys" value={String(summary.journeys)} last />
      </SettingsSection>

      <SettingsSection>
        <LinkRow label="Sources & metadata" onPress={() => router.push('/sources')} />
        <LinkRow label="Help & feedback" onPress={() => router.push('/feedback')} last />
      </SettingsSection>
    </SettingsPage>
  );
}
