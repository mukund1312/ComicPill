import { useCallback, useState } from 'react';
import { Paths } from 'expo-file-system';
import { useFocusEffect } from 'expo-router';
import { SettingsPage } from '../../ui/SettingsPage';
import { ActionRow, InfoRow, LinkRow, SettingsSection } from '../../ui/settingsUi';
import { confirm, notice } from '../../ui/dialogs';
import { formatBytes } from '../../lib/reader/bytes';
import { clearFetchedCopies, clearTemporaryFiles, storageUsage, type StorageUsage } from '../../lib/reader/storage';
import { useJob } from '../../lib/reader/importJob';
import { deviceName } from '../../lib/platform/device';
import { ActionSheet, PromptModal, type SheetOption } from '../reader/dialogs';
import { BUDGET_CHOICES_GB, budgetMode, cloudBudgetGb, setBudgetMode, setCloudBudgetGb } from '../../lib/reader/cloudBudget';
import { CLOUD_APP_CACHE_HINT } from '../../lib/reader/cloudCache';

export default function StorageScreen() {
  const device = `this ${deviceName()}`;
  const [usage, setUsage] = useState<StorageUsage>({ comics: 0, fetched: 0, temporary: 0 });
  const [measured, setMeasured] = useState(false);
  const [budget, setBudget] = useState(() => cloudBudgetGb());
  const [mode, setMode] = useState(() => budgetMode());
  const [sheet, setSheet] = useState<{ title: string; options: SheetOption[] } | null>(null);
  const [custom, setCustom] = useState(false);
  const importing = useJob().running; // clearing files an import is still using would break it
  const measure = useCallback(() => { setUsage(storageUsage()); setMeasured(true); setBudget(cloudBudgetGb()); setMode(budgetMode()); }, []);
  const pickBudget = (gb: number) => { setCloudBudgetGb(gb); setBudget(gb); };
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
      <SettingsSection title="Downloaded comics" footer={`${CLOUD_APP_CACHE_HINT} Comics you imported as copies aren’t counted here, since they’re your only copy.`}>
        <LinkRow label="Space to set aside" value={`${budget} GB`} detail="How much downloaded comics may use. Linked comics stay on your shelf; opening one downloads it." onPress={() => setSheet({
          title: 'Space for downloaded comics',
          options: [...BUDGET_CHOICES_GB.map((gb) => ({ label: `${gb} GB`, checked: budget === gb, onPress: () => pickBudget(gb) })), { label: 'Custom…', checked: !(BUDGET_CHOICES_GB as readonly number[]).includes(budget), onPress: () => setCustom(true) }],
        })} />
        <LinkRow label="When it’s full" value={mode === 'ask' ? 'Ask me' : 'Automatic'} detail={mode === 'ask' ? 'You choose which comics to put away before a new one downloads.' : 'The comics you read longest ago are put away for you.'} onPress={() => setSheet({
          title: 'When the space is full',
          options: [
            { label: 'Ask me which to put away', checked: mode === 'ask', onPress: () => { setBudgetMode('ask'); setMode('ask'); } },
            { label: 'Put away the oldest-read automatically', checked: mode === 'auto', onPress: () => { setBudgetMode('auto'); setMode('auto'); } },
          ],
        })} />
        <InfoRow label={`Free on ${device}`} value={formatBytes(Paths.availableDiskSpace)} detail="Downloads pause when this gets low, so the system always has room." last />
      </SettingsSection>

      <SettingsSection title="Used by ComicPill" footer="Google Drive and Dropbox keep their own downloaded copies too. Clear those in each app’s settings.">
        <InfoRow label={`Comics stored on ${device}`} value={measured ? formatBytes(usage.comics) : '…'} detail="Files you imported, plus every cover. Delete comics from the shelf to free this." />
        <InfoRow label="Fetched from the cloud" value={measured ? formatBytes(usage.fetched) : '…'} detail="Linked comics you opened, kept within the space you set aside above." />
        <InfoRow label="Temporary files" value={measured ? formatBytes(usage.temporary) : '…'} detail="Leftovers from picking and unpacking files. Cleared automatically when ComicPill opens." last />
      </SettingsSection>

      <SettingsSection title="Free up space" footer={importing ? 'An import is running. Wait for it to finish first.' : undefined}>
        <ActionRow label="Clear fetched copies" detail="Keeps your links, covers and progress." destructive disabled={importing || usage.fetched === 0} onPress={() => { void clear('fetched'); }} />
        <ActionRow label="Clear temporary files" destructive disabled={importing || usage.temporary === 0} onPress={() => { void clear('temporary'); }} last />
      </SettingsSection>
      <ActionSheet visible={!!sheet} title={sheet?.title} options={sheet?.options ?? []} onClose={() => setSheet(null)} />
      <PromptModal visible={custom} title="Space in GB" initial={String(budget)} submitLabel="Set" onSubmit={(v) => { const gb = Math.round(Number(v)); if (gb >= 1 && gb <= 1000) pickBudget(gb); else notice('Pick a size', 'Enter a number of gigabytes between 1 and 1000.'); }} onClose={() => setCustom(false)} />
    </SettingsPage>
  );
}
