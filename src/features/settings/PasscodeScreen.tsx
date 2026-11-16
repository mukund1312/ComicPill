// "Passcode & privacy" — the Panels-style page with a drifting cover reel behind a small settings card.
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CoverFlow, type FlowItem } from '../../ui/CoverFlow';
import { COVER_ASSETS } from '../../ui/coverAssets';
import { HeaderButton, Icon } from '../../ui/Icon';
import { Button } from '../../ui/primitives';
import { ChoiceSheet } from '../../ui/settingsUi';
import { useAppearance } from '../../ui/theme';
import { space } from '../../ui/tokens';
import { sqlite } from '../../lib/db/client';
import { passwordProblem } from '../../lib/reader/lock';
import { useAppLock } from '../../lib/applock/appLock';
import { PromptModal } from '../reader/dialogs';

type Prompt = { title: string; submitLabel: string; onSubmit: (v: string) => void } | null;

export default function PasscodeScreen() {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const lock = useAppLock((s) => s.lock); const setLock = useAppLock((s) => s.setLock); const clearLock = useAppLock((s) => s.clearLock); const verify = useAppLock((s) => s.verify);
  const [choose, setChoose] = useState(false); const [prompt, setPrompt] = useState<Prompt>(null);
  // 'new' = turning it on, 'change' = replacing it (asks for the current one first)
  const [form, setForm] = useState<null | 'new' | 'change'>(null);
  const [oldPw, setOldPw] = useState(''); const [pw1, setPw1] = useState(''); const [pw2, setPw2] = useState('');
  const closeForm = () => { setForm(null); setOldPw(''); setPw1(''); setPw2(''); };
  const saveForm = async () => {
    if (form === 'change' && !(await verify(oldPw))) { Alert.alert('Wrong passcode', 'Your current passcode isn’t right.'); return; }
    const problem = passwordProblem(pw1);
    if (problem) { Alert.alert('Too short', problem); return; }
    if (pw1 !== pw2) { Alert.alert('Those don’t match', 'Type the same passcode in both boxes.'); return; }
    try { await setLock(pw1); closeForm(); } catch (e) { Alert.alert('Couldn’t save the passcode', String(e).slice(0, 240)); }
  };
  const items: FlowItem[] = useMemo(() => {
    try {
      const ids = Object.keys(COVER_ASSETS); const step = Math.max(1, Math.floor(ids.length / 10));
      const pick = [...new Set(Array.from({ length: 10 }, (_, i) => ids[(i * step + 3) % ids.length]))];
      return sqlite.getAllSync<{ id: string; title: string }>(`SELECT id, title FROM works WHERE id IN (${pick.map(() => '?').join(',')})`, ...pick).map((w) => ({ title: w.title, workId: w.id }));
    } catch { return []; }
  }, []);

  const askOld = (then: () => void) => setPrompt({ title: 'Enter your current passcode', submitLabel: 'Continue', onSubmit: async (pw) => { if (await verify(pw)) then(); else Alert.alert('Wrong passcode', 'Nothing was changed.'); } });

  return (
    <View style={[styles.safe, { backgroundColor: c.background }]}>
      <View style={{ paddingTop: 64 }}><CoverFlow items={items} height={380} /></View>
      <SafeAreaView style={StyleSheet.absoluteFill} edges={['top']} pointerEvents="box-none">
        <View style={styles.top}><HeaderButton icon="chevron-back" label="Back" onPress={() => router.back()} /></View>
      </SafeAreaView>
      <ScrollView style={styles.sheetWrap} contentContainerStyle={styles.sheet} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: c.textPrimary, fontFamily: typography.display }]}>Passcode & privacy</Text>
        <Text style={[styles.copy, { color: c.textSecondary, fontFamily: typography.body }]}>Choose whether ComicPill asks for a passcode when it opens. You can change this any time.</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Pressable accessibilityRole="button" onPress={() => setChoose(true)} style={styles.row}>
            <Text style={[styles.label, { color: c.textPrimary, fontFamily: typography.bodyMedium }]}>Passcode lock</Text>
            <View style={styles.value}><Text style={[styles.valueText, { color: c.textSecondary, fontFamily: typography.body }]}>{lock ? 'Required to open' : 'Not required'}</Text><Icon name="chevron-expand" size={16} color={c.textMuted} /></View>
          </Pressable>
          {lock ? (
            <Pressable accessibilityRole="button" onPress={() => setForm('change')} style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
              <Text style={[styles.label, { color: c.textPrimary, fontFamily: typography.bodyMedium }]}>Change passcode</Text><Icon name="chevron-forward" size={16} color={c.textMuted} />
            </Pressable>
          ) : null}
        </View>
        {form ? (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, marginTop: 14, padding: 16, gap: 10 }]}>
            {form === 'change' ? <Field label="Current passcode" value={oldPw} onChange={setOldPw} /> : null}
            <Field label={form === 'change' ? 'New passcode' : 'Choose a passcode'} value={pw1} onChange={setPw1} />
            <Field label="Type it again" value={pw2} onChange={setPw2} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <View style={{ flex: 1 }}><Button kind="secondary" onPress={closeForm}>Cancel</Button></View>
              <View style={{ flex: 1 }}><Button onPress={saveForm} disabled={!pw1 || !pw2}>{form === 'new' ? 'Turn on' : 'Save'}</Button></View>
            </View>
          </View>
        ) : null}
        <Text style={[styles.foot, { color: c.textMuted, fontFamily: typography.body }]}>{lock ? 'The app locks when it opens and after it has been away for 30 seconds.' : 'No passcode is required to open ComicPill.'} Individual comics and folders can have their own password: long-press one on your shelf.</Text>
        <View style={{ marginTop: space.lg }}><Button onPress={() => router.back()}>Done</Button></View>
      </ScrollView>
      <ChoiceSheet visible={choose} title="Passcode lock" selected={lock ? 'on' : 'off'} onClose={() => setChoose(false)}
        choices={[{ id: 'off', label: 'Not required' }, { id: 'on', label: 'Required to open ComicPill' }]}
        onSelect={(id) => { setChoose(false); if (id === 'on' && !lock) setForm('new'); if (id === 'off' && lock) askOld(() => { void clearLock(); }); }} />
      <PromptModal visible={!!prompt} title={prompt?.title ?? ''} submitLabel={prompt?.submitLabel} secure onSubmit={(v) => prompt?.onSubmit(v)} onClose={() => setPrompt(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  top: { paddingHorizontal: space.lg, paddingTop: 8 },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 400 },
  sheet: { paddingHorizontal: space.lg, paddingBottom: 40 },
  title: { fontSize: 30, letterSpacing: -0.6, textAlign: 'center' },
  copy: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8, marginBottom: 18 },
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, minHeight: 56 },
  label: { fontSize: 16 },
  value: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  valueText: { fontSize: 16 },
  foot: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 14 },
});

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  return (
    <View>
      <Text style={{ color: c.textSecondary, fontFamily: typography.bodyMedium, fontSize: 12, marginBottom: 6 }}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} secureTextEntry autoCapitalize="none" autoCorrect={false}
        style={{ height: 50, borderRadius: 14, paddingHorizontal: 14, fontSize: 16, backgroundColor: c.surfaceRaised, color: c.textPrimary, fontFamily: typography.body }} />
    </View>
  );
}
