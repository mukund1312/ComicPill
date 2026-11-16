import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SettingsPage } from '../../ui/SettingsPage';
import { ActionRow, ChoiceSheet, InfoRow, LinkRow, SettingsSection, TextField, ToggleRow } from '../../ui/settingsUi';
import { Button, Pill } from '../../ui/primitives';
import { space } from '../../ui/tokens';
import {
  BACKGROUND_LABEL, FIT_LABEL, MODE_LABEL, type Background, type Fit, type Preset,
} from '../../lib/reader/presets';
import type { ReaderMode } from '../../lib/reader/readerLibrary';
import { clearCrash, lastCrash, type CrashRecord } from '../../lib/diagnostics/crashLog';
import { createPreset, deletePreset, listPresets, loadReaderSettings, saveReaderSettings, type ReaderSettings } from '../../lib/reader/readerSettings';

const describe = (p: Preset) => `${MODE_LABEL[p.mode]} · ${FIT_LABEL[p.fit]} · ${BACKGROUND_LABEL[p.background]}`;

export default function ReaderSettingsScreen() {
  const [settings, setSettings] = useState<ReaderSettings>(() => loadReaderSettings());
  const [presets, setPresets] = useState<Preset[]>(() => listPresets());
  const [pickDefault, setPickDefault] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<ReaderMode>('ltr');
  const [fit, setFit] = useState<Fit>('contain');
  const [background, setBackground] = useState<Background>('dark');
  const [selected, setSelected] = useState<Preset | null>(null);
  const [crash, setCrash] = useState<CrashRecord | null>(() => lastCrash());

  const patch = (p: Partial<ReaderSettings>) => setSettings(saveReaderSettings(p));
  const defaultPreset = presets.find((p) => p.id === settings.defaultPresetId) ?? presets[0];

  const savePreset = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createPreset({ name: trimmed, mode, fit, background });
    setPresets(listPresets()); setEditing(false); setName('');
  };

  return (
    <SettingsPage title="Reader" subtitle="How comics open and behave. Presets can also be set per folder or per comic from the library.">
      <SettingsSection title="Reading" footer="Incognito reads without saving progress, and keeps the comic out of Reading now.">
        <ToggleRow label="Incognito mode" value={settings.incognito} onChange={(v) => patch({ incognito: v })} />
        <ToggleRow label="Tap zones" detail="Tap the left or right edge to turn the page." value={settings.tapZones} onChange={(v) => patch({ tapZones: v })} />
        <ToggleRow label="Invert tap zones" detail="Left edge goes forward." value={settings.invertTaps} onChange={(v) => patch({ invertTaps: v })} disabled={!settings.tapZones} last />
      </SettingsSection>

      <SettingsSection title="Default look" footer="Used when a comic has no preset of its own and its folder has none.">
        <LinkRow label="Default preset" value={defaultPreset?.name} onPress={() => setPickDefault(true)} last />
      </SettingsSection>

      <SettingsSection title="Presets">
        {presets.map((p) => (
          p.builtin
            ? <InfoRow key={p.id} label={p.name} value={describe(p)} />
            : <ActionRow key={p.id} label={p.name} detail={`${describe(p)} · tap to delete`} destructive onPress={() => setSelected(p)} />
        ))}
        <ActionRow label={editing ? 'Cancel new preset' : 'New preset…'} onPress={() => setEditing(!editing)} last />
      </SettingsSection>

      {editing ? (
        <View style={styles.form}>
          <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Night manga" maxLength={24} />
          <Text style={styles.label}>Mode</Text>
          <View style={styles.pills}>{(Object.keys(MODE_LABEL) as ReaderMode[]).map((m) => <Pill key={m} label={MODE_LABEL[m]} active={mode === m} onPress={() => setMode(m)} />)}</View>
          <Text style={styles.label}>Fit</Text>
          <View style={styles.pills}>{(Object.keys(FIT_LABEL) as Fit[]).map((f) => <Pill key={f} label={FIT_LABEL[f]} active={fit === f} onPress={() => setFit(f)} />)}</View>
          <Text style={styles.label}>Background</Text>
          <View style={styles.pills}>{(Object.keys(BACKGROUND_LABEL) as Background[]).map((b) => <Pill key={b} label={BACKGROUND_LABEL[b]} active={background === b} onPress={() => setBackground(b)} />)}</View>
          <Button onPress={savePreset} disabled={!name.trim()}>Save preset</Button>
        </View>
      ) : null}

      <SettingsSection title="Diagnostics" footer="ComicPill collects nothing. The last error is kept on this phone only, to help if you report a bug.">
        {crash && crash.message
          ? <ActionRow label="Last error" detail={`${new Date(crash.at).toLocaleString()} — ${crash.message.slice(0, 120)} · tap to clear`} onPress={() => { clearCrash(); setCrash(null); }} last />
          : <InfoRow label="Last error" value="None" last />}
      </SettingsSection>

      <ChoiceSheet
        visible={pickDefault} title="Default preset" selected={settings.defaultPresetId}
        choices={presets.map((p) => ({ id: p.id, label: p.name, detail: describe(p) }))}
        onSelect={(id) => { patch({ defaultPresetId: id }); setPickDefault(false); }} onClose={() => setPickDefault(false)}
      />
      <ChoiceSheet
        visible={!!selected} title={selected ? `Delete “${selected.name}”?` : ''} message="Comics and folders using it go back to the default."
        choices={[{ id: 'delete', label: 'Delete preset' }]}
        onSelect={() => { if (selected) { deletePreset(selected.id); setSettings(loadReaderSettings()); setPresets(listPresets()); } setSelected(null); }}
        onClose={() => setSelected(null)}
      />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.md, marginBottom: space.xl },
  label: { fontSize: 14, opacity: 0.7 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
