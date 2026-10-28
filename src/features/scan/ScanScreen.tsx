// Scan: photograph a shelf and have the titles read, then review them before adding.
// The default reads the spines on the device itself (text recognition, nothing uploaded, no key).
// If the reader has set up their own AI key they can use it instead, for photos the device can't read.
// Nothing is added without a tick, and doubtful matches start unticked.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Eyebrow, Pill } from '../../ui/primitives';
import { ComicCover } from '../../ui/comic';
import { SettingsPage } from '../../ui/SettingsPage';
import { confirm, notice } from '../../ui/dialogs';
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
import { readRegion, scanShelfOnDevice, type ScanStage, type ShelfScan } from '../../lib/scan/onDevice';
import { buildIndex, type CatalogIndex } from '../../lib/scan/candidates';
import { loadCatalogEntries } from '../../lib/db/queries/catalogIndex';
import { createCustomComic } from '../../lib/db/queries/customComic';
import { setCustomCover } from '../../lib/covers/custom';
import { createDraft, deleteDraft, draftPhoto, keepDraft, loadDraft, openDrafts, saveDraftState } from '../../lib/scan/draft';
import { afterImport } from '../../lib/scan/draftModel';
import { flagRepeats, importItems, itemFromDetected, type Box, type ScanItem } from '../../lib/scan/session';
import { mergeOwn } from '../../lib/util/own';
import type { Own, ReadStatus } from '../../lib/types/domain';
import { ShelfReview } from './ShelfReview';
import { ImportResult } from './ImportResult';
import { usePermissions } from '../settings/usePermissions';

type Stage =
  | { name: 'intro' }
  | { name: 'working'; note: string }
  | { name: 'detecting'; stage: ScanStage; done?: number; total?: number }
  | { name: 'error'; kind: AiErrorKind | 'no_photo'; message: string }
  | { name: 'results'; matches: ScanMatch[]; summary: ScanSummary; format: ScanFormat }
  | { name: 'review'; draftId: string; scan: Pick<ShelfScan, 'photoUri' | 'photoWidth' | 'photoHeight'> }
  | { name: 'importing' }
  | { name: 'done'; draftId: string };

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

  // ---- on this device: no key, nothing uploaded ----
  const [items, setItems] = useState<ScanItem[]>([]);
  const [retrying, setRetrying] = useState(false);
  const indexRef = useRef<CatalogIndex | null>(null);
  const catalogIndex = () => (indexRef.current ??= buildIndex(loadCatalogEntries()));
  const draftFor = stage.name === 'review' || stage.name === 'done' ? stage.draftId : null;
  const resumable = useMemo(() => openDrafts().find((d) => (d.state as { items?: unknown[] } | null)?.items?.length), []);

  // The scan is saved as the reader works, so closing the screen doesn't lose it.
  useEffect(() => {
    if (!draftFor || stage.name !== 'review') return;
    const t = setTimeout(() => { try { saveDraftState(draftFor, { photo: stage.scan, items }); } catch { /* the review still works without the save */ } }, 500);
    return () => clearTimeout(t);
  }, [items, draftFor, stage]);

  const runDevice = async (photoUri: string) => {
    setStage({ name: 'detecting', stage: 'detecting' });
    let draftId: string | null = null;
    try {
      draftId = await createDraft(photoUri);
      const scan = await scanShelfOnDevice(photoUri, draftId, catalogIndex(), (st, done, total) => setStage({ name: 'detecting', stage: st, done, total }));
      setItems(flagRepeats(scan.detected.map((d) => itemFromDetected(d, { ownership: 'physical', reading: 'unread' }))));
      feedback.success();
      setStage({ name: 'review', draftId, scan: { photoUri: scan.photoUri, photoWidth: scan.photoWidth, photoHeight: scan.photoHeight } });
    } catch (e) {
      if (draftId) deleteDraft(draftId);
      feedback.warning();
      setStage({ name: 'error', kind: 'no_photo', message: e instanceof Error && e.message === 'NO_OCR' ? 'This build can’t read text from photos. Install the full ComicPill app (not Expo Go).' : 'That photo couldn’t be read. Please try another.' });
    }
  };
  const shelfFromCamera = async () => {
    if (!(await perms.ensure('camera'))) return;
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (!r.canceled && r.assets?.[0]) await runDevice(r.assets[0].uri);
  };
  const shelfFromGallery = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (!r.canceled && r.assets?.[0]) await runDevice(r.assets[0].uri);
  };
  const shelfFromFiles = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
    if (!r.canceled && r.assets?.[0]) await runDevice(r.assets[0].uri);
  };
  const resume = (id: string) => {
    const d = loadDraft(id);
    const st = d?.state as { photo?: ShelfScan; items?: ScanItem[] } | null;
    if (!d || !st?.items?.length || !st.photo) return;
    setItems(st.items);
    setStage({ name: 'review', draftId: id, scan: { photoUri: draftPhoto(id).uri, photoWidth: st.photo.photoWidth, photoHeight: st.photo.photoHeight } });
  };
  const addMissed = async (box: Box) => {
    if (stage.name !== 'review') return;
    const d = await readRegion(stage.scan.photoUri, stage.scan.photoWidth, stage.scan.photoHeight, box, stage.draftId, catalogIndex());
    setItems((cur) => flagRepeats([...cur, itemFromDetected(d, { ownership: 'physical', reading: 'unread' })]));
  };

  // ---- importing: each book on its own, so one failure never spoils the rest ----
  // The library is read once for the review (and again after an import), not once per card per render.
  const [ownMap, setOwnMap] = useState(() => loadArcLibrary());
  const libraryOwn = (workId: string): Own => (ownMap.get(workId)?.own ?? 'none') as Own;
  const runImport = async (list: ScanItem[]) => {
    const own = new Map<string, Own>();
    const next = await importItems(list, {
      alreadyOwned: (id) => (own.get(id) ?? libraryOwn(id)) !== 'none',
      createCustom: (comic) => createCustomComic(comic),
      save: (workId, o) => {
        const status: ReadStatus = o.reading === 'completed' ? 'done' : o.reading === 'reading' ? 'reading' : 'none';
        const merged = mergeOwn(own.get(workId) ?? libraryOwn(workId), o.ownership);
        own.set(workId, merged);
        upsertLibraryEntry(workId, { own: merged, ...(o.update && status === 'none' ? {} : { status }), ...(status === 'done' ? { finishedAt: new Date().toISOString() } : {}) });
      },
      setCover: async (workId, uri) => { await setCustomCover(workId, uri); },
    });
    setItems(next);
    setOwnMap(loadArcLibrary());
    return next;
  };
  const onImport = async () => {
    if (stage.name !== 'review') return;
    const draftId = stage.draftId;
    setStage({ name: 'importing' });
    await runImport(items);
    feedback.success();
    setStage({ name: 'done', draftId });
  };
  const onRetry = async () => { setRetrying(true); try { await runImport(items); } finally { setRetrying(false); } };
  const onFinish = (keepPhoto: boolean) => {
    if (stage.name !== 'done') return;
    if (afterImport(keepPhoto) === 'keep') keepDraft(stage.draftId); else deleteDraft(stage.draftId);
    router.replace('/library');
  };
  const discard = () => { if (draftFor) deleteDraft(draftFor); setItems([]); setStage({ name: 'intro' }); };

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

  // The review has its own full-screen layout: the shelf photo and the results scroll together.
  if (stage.name === 'review') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
        <View style={styles.reviewBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Leave; your scan is saved" hitSlop={10} onPress={() => router.back()}><Text style={[styles.reviewLink, { color: c.primary, fontFamily: typography.bodySemibold }]}>‹ Back</Text></Pressable>
          <Text style={[styles.reviewTitle, { color: c.textPrimary, fontFamily: typography.display }]}>Shelf scan</Text>
          <Text style={[styles.note, { color: c.textMuted, fontFamily: typography.body }]}>{items.length} detected</Text>
        </View>
        <View style={styles.reviewBody}>
          <ShelfReview
            scan={stage.scan} items={items} onItems={setItems} alreadyOwned={(id) => libraryOwn(id) !== 'none'}
            onImport={() => { void onImport(); }} onAddRegion={addMissed}
            onAgain={() => { void confirm({ title: 'Start over?', message: 'This scan and its photo will be deleted.', confirmLabel: 'Delete scan', destructive: true }).then((ok) => { if (ok) discard(); }); }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SettingsPage title="Scan your comics" subtitle="Turn a photo of your shelf into a library." backLabel="Back">
      {stage.name === 'intro' ? (
        <View style={styles.gap}>
          <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>
            Take a photo of a shelf with the spines facing you, about 10 to 15 comics at a time, in good light. ComicPill reads the spines on this device — nothing is uploaded and you don’t need an account or a key — then shows you what it found. Nothing is added until you say so.
          </Text>
          <Button onPress={shelfFromCamera}>Take a photo</Button>
          <Button kind="secondary" onPress={shelfFromGallery}>Choose from my photos</Button>
          <Button kind="secondary" onPress={shelfFromFiles}>Choose from Files</Button>
          <Text style={[styles.note, { color: c.textMuted, fontFamily: typography.body }]}>Photograph the spines of your comics. Keep titles visible and avoid glare. You can correct any book before it is added, and add one the scan missed.</Text>
          {resumable ? <Button kind="ghost" onPress={() => resume(resumable.id)}>Continue my last scan</Button> : null}
          {hasKey ? (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Eyebrow>Optional: use your AI key</Eyebrow>
              <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>For photos the device can’t read, or screenshots of a digital library. Up to {MAX_PHOTOS} photos · one AI request.</Text>
              <Button kind="secondary" onPress={fromCamera}>Scan with AI (camera)</Button>
              <Button kind="secondary" onPress={fromLibrary}>Scan with AI (choose photos)</Button>
            </View>
          ) : null}
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

      {stage.name === 'detecting' ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.primary} size="large" />
          {(['detecting', 'reading', 'spines', 'matching'] as const).map((st) => {
            const order = ['detecting', 'reading', 'spines', 'matching'] as const;
            const state = order.indexOf(st) < order.indexOf(stage.stage) ? 'done' : st === stage.stage ? 'now' : 'next';
            const label = st === 'detecting' ? 'Detecting books' : st === 'reading' ? 'Reading the shelf' : st === 'spines' ? `Reading each spine${state === 'now' && stage.total ? ` (${Math.min(stage.total, (stage.done ?? 0) + 1)} of ${stage.total})` : ''}` : 'Finding catalog matches';
            return <Text key={st} accessibilityLiveRegion={state === 'now' ? 'polite' : undefined} style={[styles.body, { color: state === 'now' ? c.textPrimary : c.textMuted, fontFamily: state === 'now' ? typography.bodySemibold : typography.body }]}>{state === 'done' ? '✓ ' : ''}{label}</Text>;
          })}
        </View>
      ) : null}

      {stage.name === 'importing' ? (
        <View style={styles.center}><ActivityIndicator color={c.primary} size="large" /><Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>Adding to your library…</Text></View>
      ) : null}

      {stage.name === 'done' ? <ImportResult items={items} onRetry={() => { void onRetry(); }} onFinish={onFinish} retrying={retrying} /> : null}

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
  reviewBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md },
  reviewLink: { fontSize: 16 },
  reviewTitle: { fontSize: 20 },
  reviewBody: { flex: 1, paddingHorizontal: space.lg },
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
