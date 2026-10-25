// Scan: photograph a shelf (or pick screenshots of a digital library), have
// the reader's own AI read the titles, and review the matches before adding.
// One photo action = one AI request. Nothing is added without a tick, and
// doubtful matches start unticked. With no key the screen says so plainly and
// offers manual add — it never pretends to have scanned anything.
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Button, Eyebrow, Pill } from '../../ui/primitives';
import { ComicCover } from '../../ui/comic';
import { SettingsPage } from '../../ui/SettingsPage';
import { notice } from '../../ui/dialogs';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { useAiConfig } from '../../lib/ai/useAiConfig';
import type { AiErrorKind } from '../../lib/ai/types';
import { loadArcLibrary, loadWorkTitles } from '../../lib/db/queries/arc';
import { upsertLibraryEntry } from '../../lib/db/queries/library';
import { MAX_PHOTOS, scanPhotos } from '../../lib/scan/run';
import { prepareForScan } from '../../lib/scan/prepare';
import { matchScannedBooks, summarizeScan, type ScanMatch, type ScanSummary } from '../../lib/scan/match';
import { defaultSelection, planAdditions, type ScanFormat } from '../../lib/scan/additions';
import { feedback } from '../../lib/platform/feedback';
import { usePermissions } from '../settings/usePermissions';

type Stage =
  | { name: 'intro' }
  | { name: 'working'; note: string }
  | { name: 'error'; kind: AiErrorKind | 'no_photo'; message: string }
  | { name: 'results'; matches: ScanMatch[]; summary: ScanSummary; format: ScanFormat };

const STATUS_LABEL: Record<ScanMatch['status'], string> = { matched: 'Matched', review: 'Check this one', unmatched: 'Not in the catalog' };

export default function ScanScreen() {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const ai = useAiConfig();
  const perms = usePermissions();
  const [stage, setStage] = useState<Stage>({ name: 'intro' });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const catalog = useMemo(() => [...loadWorkTitles()].map(([id, title]) => ({ id, title })), []);

  const run = async (uris: string[], format: ScanFormat) => {
    setStage({ name: 'working', note: 'Preparing your photo…' });
    const images = await prepareForScan(uris);
    if (images.length === 0) { setStage({ name: 'error', kind: 'no_photo', message: 'That photo couldn’t be read. Please try another.' }); return; }
    setStage({ name: 'working', note: 'Reading your comics… this uses your AI key once.' });
    const res = await scanPhotos(ai.config, images);
    if (!res.ok) { feedback.warning(); setStage({ name: 'error', kind: res.kind, message: res.message }); return; }
    const matches = matchScannedBooks(res.data.books, catalog);
    setSelected(defaultSelection(matches));
    feedback.success();
    setStage({ name: 'results', matches, summary: summarizeScan(matches, res.data.unreadable), format });
  };

  const fromCamera = async () => {
    if (!(await perms.ensure('camera'))) return;
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (!r.canceled && r.assets?.length) await run(r.assets.map((a) => a.uri), 'physical');
  };

  const fromLibrary = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS, quality: 1 });
    if (!r.canceled && r.assets?.length) await run(r.assets.map((a) => a.uri), 'digital');
  };

  const toggle = (workId: string) => setSelected((cur) => { const next = new Set(cur); if (next.has(workId)) next.delete(workId); else next.add(workId); return next; });

  const add = (matches: ScanMatch[], format: ScanFormat) => {
    const library = loadArcLibrary();
    const plan = planAdditions(matches, selected, format, (id) => library.get(id)?.own ?? 'none');
    for (const p of plan) upsertLibraryEntry(p.workId, { own: p.own });
    feedback.success();
    notice(plan.length === 1 ? 'Added 1 comic' : `Added ${plan.length} comics`, 'They’re in your library now.');
    router.replace('/library');
  };

  const hasKey = !!ai.config;

  return (
    <SettingsPage title="Scan your comics" subtitle="Turn a photo of your shelf into a library." backLabel="Back">
      {stage.name === 'intro' ? (
        <View style={styles.gap}>
          {hasKey ? (
            <>
              <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>
                Take a photo of your shelf, or choose screenshots of a digital library. ComicPill reads the titles with your AI key, then shows you what it found — nothing is added until you say so.
              </Text>
              <Button onPress={fromCamera}>Scan with camera</Button>
              <Button kind="secondary" onPress={fromLibrary}>Choose screenshots or photos</Button>
              <Text style={[styles.note, { color: c.textMuted, fontFamily: typography.body }]}>Up to {MAX_PHOTOS} photos at a time · one AI request</Text>
            </>
          ) : (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Eyebrow>Needs an AI key</Eyebrow>
              <Text style={[styles.body, { color: c.textPrimary, fontFamily: typography.body }]}>
                Scanning reads your photo with an AI model, so it needs your own API key. Add one in Settings — it takes a minute — or add comics by hand.
              </Text>
              <Button onPress={() => router.push('/ai-settings')}>Set up AI assistant</Button>
            </View>
          )}
          <Button kind="ghost" onPress={() => router.push('/library')}>Add manually instead</Button>
        </View>
      ) : null}

      {stage.name === 'working' ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.primary} size="large" />
          <Text accessibilityLiveRegion="polite" style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>{stage.note}</Text>
        </View>
      ) : null}

      {stage.name === 'error' ? (
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.h2, { color: c.textPrimary, fontFamily: typography.display }]}>That didn’t work.</Text>
          <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>{stage.message}</Text>
          {stage.kind === 'unauthorized' || stage.kind === 'model_not_found' ? <Button onPress={() => router.push('/ai-settings')}>Check AI settings</Button> : null}
          <Button kind="secondary" onPress={() => setStage({ name: 'intro' })}>Try again</Button>
        </View>
      ) : null}

      {stage.name === 'results' ? (
        <Results
          stage={stage} selected={selected} onToggle={toggle}
          onFormat={(format) => setStage({ ...stage, format })}
          onAdd={() => add(stage.matches, stage.format)}
          onAgain={() => setStage({ name: 'intro' })}
        />
      ) : null}
    </SettingsPage>
  );
}

function Results({ stage, selected, onToggle, onFormat, onAdd, onAgain }: {
  stage: Extract<Stage, { name: 'results' }>; selected: Set<string>; onToggle: (id: string) => void;
  onFormat: (f: ScanFormat) => void; onAdd: () => void; onAgain: () => void;
}) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const { matches, summary, format } = stage;
  const found = matches.filter((m) => m.workId);
  const missing = matches.filter((m) => !m.workId);
  const count = found.filter((m) => selected.has(m.workId!)).length;

  if (matches.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={[styles.h2, { color: c.textPrimary, fontFamily: typography.display }]}>No comics found.</Text>
        <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>
          {summary.unreadable > 0 ? `I could see ${summary.unreadable} that I couldn’t read. Try a closer, brighter photo of the spines.` : 'I couldn’t make out any comics in that photo. Try a closer, brighter one.'}
        </Text>
        <Button onPress={onAgain}>Try another photo</Button>
      </View>
    );
  }

  return (
    <View style={styles.gap}>
      <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>
        Found {summary.matched} match{summary.matched === 1 ? '' : 'es'}
        {summary.review ? `, ${summary.review} to check` : ''}{summary.unmatched ? `, ${summary.unmatched} not in the catalog` : ''}
        {summary.unreadable ? `, and ${summary.unreadable} I couldn’t read` : ''}.
      </Text>

      <View style={styles.pills}>
        <Pill label="Physical copies" active={format === 'physical'} onPress={() => onFormat('physical')} />
        <Pill label="Digital copies" active={format === 'digital'} onPress={() => onFormat('digital')} />
      </View>

      {found.map((m) => {
        const on = selected.has(m.workId!);
        return (
          <Pressable
            key={m.workId} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${m.workTitle}, ${STATUS_LABEL[m.status]}`}
            onPress={() => onToggle(m.workId!)} style={({ pressed }) => [styles.row, { borderColor: on ? c.primary : c.border, backgroundColor: pressed ? c.surfaceRaised : c.surface }]}
          >
            <Text style={[styles.check, { color: on ? c.primary : c.textMuted }]}>{on ? '✓' : '○'}</Text>
            <ComicCover title={m.workTitle!} workId={m.workId!} size="tiny" recyclingKey={`scan-${m.workId}`} />
            <View style={styles.flex}>
              <Text numberOfLines={2} style={[styles.rowTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{m.workTitle}</Text>
              <Text style={[styles.note, { color: m.status === 'matched' ? c.success : c.warning, fontFamily: typography.bodyMedium }]}>{STATUS_LABEL[m.status]}</Text>
              {m.status === 'review' ? <Text style={[styles.note, { color: c.textMuted, fontFamily: typography.body }]}>You scanned: {m.scanned.title}{m.scanned.volume ? ` ${m.scanned.volume}` : ''}</Text> : null}
            </View>
          </Pressable>
        );
      })}

      {missing.length ? (
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Eyebrow>Not in the catalog yet</Eyebrow>
          {missing.map((m) => <Text key={`${m.scanned.title}${m.scanned.volume ?? ''}`} style={[styles.note, { color: c.textSecondary, fontFamily: typography.body }]}>• {m.scanned.title}{m.scanned.volume ? ` ${m.scanned.volume}` : ''}</Text>)}
        </View>
      ) : null}

      <Button onPress={onAdd} disabled={count === 0}>{count === 0 ? 'Select comics to add' : `Add ${count} to library`}</Button>
      <Button kind="ghost" onPress={onAgain}>Scan again</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md, marginTop: space.lg },
  center: { alignItems: 'center', gap: space.md, paddingVertical: 64 },
  card: { borderWidth: 1, borderRadius: 16, padding: space.lg, gap: space.md, marginTop: space.lg },
  body: { fontSize: 14, lineHeight: 21 },
  note: { fontSize: 12, lineHeight: 17 },
  h2: { fontSize: 22 },
  pills: { flexDirection: 'row', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderRadius: 14, padding: space.md },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 15 },
  check: { fontSize: 22, width: 24, textAlign: 'center' },
});
