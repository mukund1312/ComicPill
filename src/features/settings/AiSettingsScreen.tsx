// Optional: the reader's own AI key. With one, "Build me an arc" understands
// natural language and Scan can read a shelf photo. Without one, everything
// else in ComicPill works exactly the same. The key is checked with the
// provider before it is saved, kept in secure storage, and used only when the
// reader taps a button that needs it.
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button } from '../../ui/primitives';
import { SettingsPage } from '../../ui/SettingsPage';
import { ActionRow, ChoiceSheet, LinkRow, SettingsSection, TextField, type Choice } from '../../ui/settingsUi';
import { confirm } from '../../ui/dialogs';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { useSettings } from '../../lib/state/settings';
import { useKeyStore } from '../../lib/ai/keyStore';
import { useAiConfig } from '../../lib/ai/useAiConfig';
import { checkKey } from '../../lib/ai/client';
import { checkKeyShape, maskKey, normalizeKeyInput, SHAPE_MESSAGE } from '../../lib/ai/keys';
import { DEFAULT_MODEL, MODEL_CHOICES, modelLabel, PROVIDER_LABEL } from '../../lib/ai/models';
import type { Provider } from '../../lib/ai/types';
import { feedback } from '../../lib/platform/feedback';

const KEY_PAGES: Record<Provider, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
};

export default function AiSettingsScreen() {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const { provider, model, key } = useAiConfig();
  const update = useSettings((s) => s.update);
  const save = useKeyStore((s) => s.save);
  const remove = useKeyStore((s) => s.remove);

  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<null | 'provider' | 'model'>(null);
  const [status, setStatus] = useState<string | null>(null);
  const close = () => setSheet(null);

  const providerChoices: Choice<Provider>[] = (['anthropic', 'openai'] as const).map((p) => ({ id: p, label: PROVIDER_LABEL[p] }));
  const modelChoices: Choice<string>[] = MODEL_CHOICES[provider].map((m) => ({ id: m.id, label: m.label, detail: m.detail }));

  const chooseProvider = (p: Provider) => {
    update({ aiProvider: p, aiModel: DEFAULT_MODEL[p] });
    setDraft(''); setError(undefined); setStatus(null);
    close();
  };

  const paste = async () => {
    const text = await Clipboard.getStringAsync().catch(() => '');
    if (text) { setDraft(text); setError(undefined); }
  };

  const verifyAndSave = async () => {
    const normalized = normalizeKeyInput(draft);
    const shape = checkKeyShape(provider, normalized);
    if (shape !== 'ok') { setError(SHAPE_MESSAGE[shape](provider)); feedback.warning(); return; }
    setBusy(true); setError(undefined); setStatus(null);
    try {
      const res = await checkKey({ provider, model, apiKey: normalized });
      if (!res.ok && res.kind === 'network') {
        // Offline: don't lock them out, but be clear it wasn't checked.
        if (!await confirm({ title: 'Couldn’t verify the key', message: 'You seem to be offline, so the key couldn’t be checked. Save it anyway?', confirmLabel: 'Save anyway' })) return;
      } else if (!res.ok) {
        setError(res.message); feedback.warning(); return;
      }
      await save(provider, normalized);
      setDraft('');
      feedback.success();
      setStatus(res.ok && res.data.modelAvailable === false
        ? `Key saved, but it can’t use ${modelLabel(provider, model)}. Pick another model below.`
        : res.ok ? 'Key verified and saved.' : 'Key saved (not verified).');
    } finally {
      setBusy(false);
    }
  };

  const testAgain = async () => {
    if (!key) return;
    setBusy(true); setStatus(null);
    const res = await checkKey({ provider, model, apiKey: key });
    setBusy(false);
    setStatus(!res.ok ? res.message : res.data.modelAvailable === false ? `The key works, but it can’t use ${modelLabel(provider, model)}.` : 'The key works.');
  };

  const removeKey = async () => {
    if (!await confirm({ title: 'Remove this key?', message: 'It will be deleted from this phone. ComicPill goes back to working without AI. You can add a key again any time.', confirmLabel: 'Remove', destructive: true })) return;
    await remove(provider);
    setStatus(null);
    feedback.warning();
  };

  return (
    <SettingsPage title="AI assistant" subtitle="Optional. Bring your own key." backLabel="Settings">
      <SettingsSection footer="With a key, Build me an arc understands what you type in your own words, and Scan can read a photo of your shelf. Without one, everything else in ComicPill works the same.">
        <View style={styles.pad}>
          <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>
            Your key is kept in your phone’s secure storage and sent only to {PROVIDER_LABEL[provider]} — never to ComicPill. It is used only when you tap a button that needs it, one request at a time, and it is billed to your account.
          </Text>
        </View>
      </SettingsSection>

      <SettingsSection title="Provider">
        <LinkRow label="Provider" value={PROVIDER_LABEL[provider]} onPress={() => setSheet('provider')} />
        <LinkRow label="Model" value={modelLabel(provider, model)} detail="A smaller model costs less per request." onPress={() => setSheet('model')} last />
      </SettingsSection>

      <SettingsSection title="API key">
        {key ? (
          <>
            <View style={styles.pad}>
              <Text style={[styles.masked, { color: c.textPrimary, fontFamily: typography.bodySemibold }]}>{maskKey(key)}</Text>
              <Text style={[styles.body, { color: c.success, fontFamily: typography.bodyMedium }]}>A {PROVIDER_LABEL[provider]} key is saved.</Text>
            </View>
            <ActionRow label="Test the key" detail="A free check with the provider." onPress={testAgain} disabled={busy} />
            <ActionRow label="Remove key" destructive onPress={removeKey} last />
          </>
        ) : (
          <View style={styles.pad}>
            <TextField label={`${PROVIDER_LABEL[provider]} API key`} value={draft} onChangeText={(t) => { setDraft(t); setError(undefined); }} error={error} secure autoCapitalize="none" autoCorrect={false} placeholder={provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'} />
            <View style={styles.row}>
              <Button kind="secondary" style={styles.flex} onPress={paste}>Paste</Button>
              <Button style={styles.flex} onPress={verifyAndSave} disabled={busy || !draft.trim()}>{busy ? 'Checking…' : 'Save & check'}</Button>
            </View>
            <Text onPress={() => { void Linking.openURL(KEY_PAGES[provider]); }} accessibilityRole="link" style={[styles.link, { color: c.primary, fontFamily: typography.bodySemibold }]}>
              Where do I get a key? →
            </Text>
          </View>
        )}
        {status ? <Text accessibilityLiveRegion="polite" style={[styles.status, { color: c.textSecondary, fontFamily: typography.body }]}>{status}</Text> : null}
      </SettingsSection>

      <ChoiceSheet<Provider> visible={sheet === 'provider'} title="Provider" message="Each provider has its own key." choices={providerChoices} selected={provider} onSelect={chooseProvider} onClose={close} />
      <ChoiceSheet<string> visible={sheet === 'model'} title="Model" choices={modelChoices} selected={model} onSelect={(id) => { update({ aiModel: id }); close(); }} onClose={close} />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  pad: { padding: space.md, gap: space.md },
  body: { fontSize: 14, lineHeight: 21 },
  masked: { fontSize: 22, letterSpacing: 1 },
  row: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
  link: { fontSize: 14 },
  status: { fontSize: 13, lineHeight: 19, paddingHorizontal: space.md, paddingBottom: space.md },
});
