import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { SettingsPage } from '../../ui/SettingsPage';
import { ActionRow, InfoRow, SettingsSection } from '../../ui/settingsUi';
import { confirm, notice } from '../../ui/dialogs';
import { formatBytes } from '../../lib/reader/bytes';
import { clearFetchedCopies, clearTemporaryFiles, storageUsage, type StorageUsage } from '../../lib/reader/storage';
import { useJob } from '../../lib/reader/importJob';
import { deviceName } from '../../lib/platform/device';

export default function StorageScreen() {
  const device = `this ${deviceName()}`;
  const [usage, setUsage] = useState<StorageUsage>({ comics: 0, fetched: 0, temporary: 0 });
  const [measured, setMeasured] = useState(false);
  const importing = useJob().running; // clearing files an import is still using would break it
  const measure = useCallback(() => { setUsage(storageUsage()); setMeasured(true); }, []);
  useFocusEffect(useCallback(() => { measure(); }, [measure]));

  const clear = async (what: 'fetched' | 'temporary') => {
    const fetched = what === 'fetched';
    const ok = await confirm({
      title: fetched ? 'Clear fetched copies?' : 'Clear temporary files?',
      message: fetched
        ? 'Comics you linked from Drive or Dropbox stay on your shelf with their covers and progress. Each one is fetched again the next time you open it.'
        : 'These are leftovers from picking and unpacking files. Nothing on your shelf is touched.',
      confirmLabel: 'Clear',
      destructive: true,
    });
    if (!ok) return;
    const freed = fetched ? clearFetchedCopies() : clearTemporaryFiles();
    measure();
    notice('Done', freed > 0 ? `Freed ${formatBytes(freed)}.` : 'There was nothing to clear.');
  };

  return (
    <SettingsPage title="Storage" subtitle={`What ComicPill keeps on ${device}.`} backLabel="Settings">
      <SettingsSection title="Used by ComicPill" footer="Google Drive and Dropbox keep their own downloaded copies too. Clear those in each app’s settings.">
        <InfoRow label={`Comics stored on ${device}`} value={measured ? formatBytes(usage.comics) : '…'} detail="Files you imported, plus every cover. Delete comics from the shelf to free this." />
        <InfoRow label="Fetched from the cloud" value={measured ? formatBytes(usage.fetched) : '…'} detail="Linked comics you opened. Cleans itself up past 2 GB." />
        <InfoRow label="Temporary files" value={measured ? formatBytes(usage.temporary) : '…'} detail="Leftovers from picking and unpacking files. Cleared automatically when ComicPill opens." last />
      </SettingsSection>

      <SettingsSection title="Free up space" footer={importing ? 'An import is running. Wait for it to finish first.' : undefined}>
        <ActionRow label="Clear fetched copies" detail="Keeps your links, covers and progress." destructive disabled={importing || usage.fetched === 0} onPress={() => { void clear('fetched'); }} />
        <ActionRow label="Clear temporary files" destructive disabled={importing || usage.temporary === 0} onPress={() => { void clear('temporary'); }} last />
      </SettingsSection>
    </SettingsPage>
  );
}
