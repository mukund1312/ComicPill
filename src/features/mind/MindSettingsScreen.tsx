import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { galleryAvailable } from '../../lib/mind/capture/mediaLibrary';
import { galleryAccess, listAlbumTitles, requestGalleryAccess } from '../../lib/mind/capture/scan';
import { DAY_NAMES } from '../../lib/mind/engine/weekPlanner';
import { SIGNALS, SIGNAL_LABEL, DEFAULT_WEIGHTS, suggestWeights, type Signal } from '../../lib/mind/engine/tasteScorer';
import { DEFAULT_THRESHOLDS, type Thresholds } from '../../lib/mind/engine/verdictRules';
import { buildAndSaveDigest } from '../../lib/mind/digestDb';
import { syncDigestNotification } from '../../lib/mind/notify';
import { deleteAllMindData } from '../../lib/mind/queries';
import { aiBudget, getMindSettings, loadComicVineKey, resetMindSettings, saveComicVineKey, updateMindSettings, useMindSettings } from '../../lib/mind/settings';
import { ratingEvents } from '../../lib/mind/taste';
import { syncMindTask } from '../../lib/mind/task';
import { requestPermission } from '../../lib/platform/permissions';
import { SettingsPage } from '../../ui/SettingsPage';
import { ActionRow, ChoiceSheet, InfoRow, LinkRow, SettingsSection, TextField, ToggleRow } from '../../ui/settingsUi';
import { color, font, radius, space } from '../../ui/tokens';

function Stepper({ label, value, min, max, step = 1, unit = '', onChange, last }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; last?: boolean }) {
  return (
    <View style={[styles.stepRow, !last && styles.stepBorder]}>
      <Text style={styles.stepLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable accessibilityLabel={`Decrease ${label}`} onPress={() => onChange(Math.max(min, value - step))} hitSlop={8} style={styles.stepBtn}><Text style={styles.stepGlyph}>−</Text></Pressable>
        <Text style={styles.stepValue}>{value}{unit}</Text>
        <Pressable accessibilityLabel={`Increase ${label}`} onPress={() => onChange(Math.min(max, value + step))} hitSlop={8} style={styles.stepBtn}><Text style={styles.stepGlyph}>+</Text></Pressable>
      </View>
    </View>
  );
}

const THRESHOLD_ROWS: Array<[keyof Thresholds, string, number, number]> = [
  ['digitalBelow', 'Digital below score', 30, 80], ['borrowFrom', 'Borrow from score', 50, 90], ['buyAtLeast', 'Buy physical from score', 60, 100], ['shortRunMax', 'Short run: up to volumes', 3, 30], ['longRunMin', 'Long series: from volumes', 6, 100],
];

export default function MindSettingsScreen() {
  const s = useMindSettings();
  const [albums, setAlbums] = useState<string[] | null>(null);
  const [dayPicker, setDayPicker] = useState(false);
  const [cv, setCv] = useState('');
  const [cvSaved, setCvSaved] = useState<boolean | null>(null);
  useEffect(() => { void loadComicVineKey().then((k) => setCvSaved(!!k)); }, []);

  const resync = () => { try { const d = buildAndSaveDigest(); void syncDigestNotification(getMindSettings(), d); void syncMindTask(); } catch { /* nothing to plan yet */ } };
  const set = (patch: Parameters<typeof updateMindSettings>[0]) => { updateMindSettings(patch); resync(); };

  const toggleWatching = async (on: boolean) => {
    if (!on) { set({ watching: false }); return; }
    if (!galleryAvailable()) { Alert.alert('Needs the full app', 'Watching a screenshot album can’t run inside Expo Go. Install the ComicPill app (APK or development build) to use it. Adding comics by title works here.'); return; }
    let access = await galleryAccess();
    if (access === 'denied') access = await requestGalleryAccess();
    if (access === 'denied') { Alert.alert('Photos access is off', 'Allow photo access in your phone’s settings to let ComicPill watch one album.'); return; }
    if (access === 'limited') Alert.alert('Only some photos are shared', 'You picked “selected photos”. ComicPill can only see those. To watch a whole album, allow access to all photos.');
    // Start from now: old screenshots are only read if the reader asks to look back.
    set({ watching: true, lastScanAt: s.lastScanAt || Date.now() });
  };
  const pickAlbum = async () => setAlbums(await listAlbumTitles());

  const suggest = () => {
    const events = ratingEvents();
    if (events.length < 8) { Alert.alert('Not enough ratings yet', 'Rate at least 8 comics first — about 40 gives a trustworthy suggestion.'); return; }
    const w = suggestWeights(events, s.weights);
    Alert.alert('Suggested weights', SIGNALS.map((k) => `${SIGNAL_LABEL[k]}: ${Math.round(s.weights[k] * 100)}% → ${Math.round(w[k] * 100)}%`).join('\n'), [{ text: 'Keep mine', style: 'cancel' }, { text: 'Use these', onPress: () => set({ weights: w }) }]);
  };
  const setWeight = (k: Signal, pct: number) => {
    const raw = { ...s.weights, [k]: pct / 100 };
    const total = SIGNALS.reduce((a, x) => a + raw[x], 0) || 1;
    set({ weights: Object.fromEntries(SIGNALS.map((x) => [x, Math.round((raw[x] / total) * 1000) / 1000])) as typeof s.weights });
  };

  const deleteAll = () => Alert.alert('Delete all Mind Space data?', 'Screenshots found, matches, ratings, scores and past plans are removed from this phone. Your screenshots stay in your gallery.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete everything', style: 'destructive', onPress: () => { deleteAllMindData(); resetMindSettings(); void syncDigestNotification({ ...getMindSettings(), digestEnabled: false }, null); void syncMindTask(); router.replace('/mind'); } },
  ]);

  return (
    <SettingsPage title="Mind Space" subtitle="Screenshots in, a weekly reading plan out.">
      <SettingsSection title="Screenshots" footer="Only the one album below is read, and the text on each screenshot is checked on this phone before anything can be sent.">
        <ToggleRow label="Watch an album" value={s.watching} onChange={toggleWatching} />
        <LinkRow label="Album" value={s.albumTitle} onPress={pickAlbum} />
        <ToggleRow label="Auto-send" detail="Skip the review step for comic-looking screenshots. Private ones are still never sent." value={s.autoSend} onChange={(v) => set({ autoSend: v })} last />
      </SettingsSection>

      <SettingsSection title="Weekly plan" footer="You get one notification a week, on the day you choose. Nothing else.">
        <Stepper label="I read about" value={s.capacity} min={1} max={30} unit={s.capacity === 1 ? ' / week' : ' / week'} onChange={(v) => set({ capacity: v })} />
        <Stepper label="Reading days" value={s.readingDays} min={1} max={7} onChange={(v) => set({ readingDays: v })} />
        <ToggleRow label="Weekly digest" value={s.digestEnabled} onChange={async (v) => { if (v) await requestPermission('notifications').catch(() => undefined); set({ digestEnabled: v }); }} />
        <LinkRow label="Digest day" value={DAY_NAMES[s.digestDay]} onPress={() => setDayPicker(true)} />
        <Stepper label="Digest hour" value={s.digestHour} min={0} max={23} unit=":00" onChange={(v) => set({ digestHour: v, digestMinute: 0 })} last />
      </SettingsSection>

      <SettingsSection title="Money and shelf" footer="Used by the physical-or-digital rules. Leave the budget blank for none.">
        <TextField label="Monthly budget for physical comics" value={s.monthlyBudget === null ? '' : String(s.monthlyBudget)} onChangeText={(t) => { const n = Number.parseFloat(t); set({ monthlyBudget: t.trim() === '' || !Number.isFinite(n) ? null : Math.max(0, n) }); }} placeholder="e.g. 2000" />
        <Stepper label="Typical price of one volume" value={s.typicalPrice} min={1} max={5000} step={5} onChange={(v) => set({ typicalPrice: v })} />
        <ToggleRow label="Shelf space is tight" value={s.shelfTight} onChange={(v) => set({ shelfTight: v })} />
        <InfoRow label="Spent this month" value={String(s.spent.amount)} last />
      </SettingsSection>

      <SettingsSection title="Verdict thresholds" footer="Starting numbers; the first matching rule wins.">
        {THRESHOLD_ROWS.map(([k, label, min, max]) => <Stepper key={k} label={label} value={s.thresholds[k]} min={min} max={max} onChange={(v) => set({ thresholds: { ...s.thresholds, [k]: v } })} />)}
        <ActionRow label="Reset thresholds" onPress={() => set({ thresholds: DEFAULT_THRESHOLDS })} last />
      </SettingsSection>

      <SettingsSection title="Taste weights" footer="How much each signal counts in a score. They always add up to 100%. After about 40 ratings, ‘Suggest’ checks which signals actually predicted you.">
        {SIGNALS.map((k) => <Stepper key={k} label={SIGNAL_LABEL[k]} value={Math.round(s.weights[k] * 100)} min={0} max={100} step={5} unit="%" onChange={(v) => setWeight(k, v)} />)}
        <ActionRow label="Suggest from my ratings" onPress={suggest} />
        <ActionRow label="Reset weights" onPress={() => set({ weights: DEFAULT_WEIGHTS })} last />
      </SettingsSection>

      <SettingsSection title="Lookups" footer="One AI call per approved screenshot and one per new comic — the limit below is your spending guard. Manga are looked up on AniList, no key needed. Western comics use Comic Vine, which needs your own free key from comicvine.gamespot.com/api. Claude or OpenAI keys are set under AI assistant.">
        <TextField label={cvSaved ? 'Comic Vine key (saved — paste to replace)' : 'Comic Vine key'} value={cv} onChangeText={setCv} secure placeholder="Paste your key" />
        <ActionRow label="Save Comic Vine key" disabled={!cv.trim()} onPress={async () => { await saveComicVineKey(cv); setCv(''); setCvSaved(true); }} />
        {cvSaved ? <ActionRow label="Remove Comic Vine key" destructive onPress={async () => { await saveComicVineKey(null); setCvSaved(false); }} /> : null}
        <LinkRow label="AI assistant (Claude / OpenAI key)" onPress={() => router.push('/ai-settings')} />
        <Stepper label="AI reads allowed per month" value={s.aiCallsPerMonth} min={20} max={2000} step={20} onChange={(v) => set({ aiCallsPerMonth: v })} />
        <InfoRow label="Used this month" value={`${aiBudget.used()} of ${s.aiCallsPerMonth}`} last />
      </SettingsSection>

      <SettingsSection title="Privacy">
        <LinkRow label="What is sent" onPress={() => router.push('/mind/privacy')} />
        <ActionRow label="Delete all Mind Space data" destructive onPress={deleteAll} last />
      </SettingsSection>

      <ChoiceSheet visible={albums !== null} title="Which album?" selected={s.albumTitle} choices={(albums ?? []).map((a) => ({ id: a, label: a }))} onSelect={(a) => { set({ albumTitle: a, lastScanAt: Date.now() }); setAlbums(null); }} onClose={() => setAlbums(null)} footnote={albums && albums.length === 0 ? 'No albums found. Allow photo access first.' : undefined} />
      <ChoiceSheet visible={dayPicker} title="Digest day" selected={String(s.digestDay)} choices={DAY_NAMES.map((d, i) => ({ id: String(i), label: d }))} onSelect={(i) => { set({ digestDay: Number(i) }); setDayPicker(false); }} onClose={() => setDayPicker(false)} />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: space.md },
  stepBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  stepLabel: { flex: 1, color: color.text, fontFamily: font.body, fontSize: 15 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepBtn: { width: 34, height: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { color: color.text, fontSize: 20, lineHeight: 22 },
  stepValue: { minWidth: 52, textAlign: 'center', color: color.text, fontFamily: font.bodyMedium, fontSize: 15 },
});
