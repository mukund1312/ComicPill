// Setting up the shelf: scan it, import screenshots, or search and add by hand.
// Nothing is added on the reader's behalf — scan results start ticked only when the
// match is solid, and every book can be edited (or several at once) before saving.
// Ownership and reading status are two separate choices.
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { StageFrame } from './StageFrame';
import { Button, Eyebrow, Pill } from '../../ui/primitives';
import { ComicCover } from '../../ui/comic';
import { ChoiceSheet, TextField, type Choice } from '../../ui/settingsUi';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { useAiConfig } from '../../lib/ai/useAiConfig';
import type { AiErrorKind } from '../../lib/ai/types';
import { loadWorkTitles } from '../../lib/db/queries/arc';
import { searchWorks } from '../../lib/db/queries/search';
import { MAX_PHOTOS, scanPhotos } from '../../lib/scan/run';
import { prepareForScan } from '../../lib/scan/prepare';
import { matchScannedBooks, summarizeScan, type ScanMatch, type ScanSummary } from '../../lib/scan/match';
import { defaultSelection } from '../../lib/scan/additions';
import {
  addItems, draftStats, OWNERSHIP_LABEL, OWNERSHIP_ORDER, patchItems, READING_LABEL, READING_ORDER, removeItems,
  type DraftItem, type Ownership, type ReadingState, type Source,
} from '../../lib/onboarding/collectionDraft';
import { feedback } from '../../lib/platform/feedback';
import { usePermissions } from '../settings/usePermissions';

type View_ =
  | { name: 'home' }
  | { name: 'working'; note: string }
  | { name: 'error'; kind: AiErrorKind | 'no_photo'; message: string }
  | { name: 'review'; matches: ScanMatch[]; summary: ScanSummary; format: 'physical' | 'digital'; source: Source }
  | { name: 'search' };

const OWN_CHOICES: Choice<Ownership>[] = OWNERSHIP_ORDER.map((id) => ({ id, label: OWNERSHIP_LABEL[id] }));
const READ_CHOICES: Choice<ReadingState>[] = READING_ORDER.map((id) => ({ id, label: READING_LABEL[id] }));

type Sheet = { kind: 'own' | 'read'; ids: string[] } | null;

export function CollectionStage({ draft, setDraft, onSave, onSkip, onBack, saving }: {
  draft: DraftItem[]; setDraft: (d: DraftItem[]) => void; onSave: () => void; onSkip: () => void; onBack: (() => void) | null; saving: boolean;
}) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const ai = useAiConfig();
  const perms = usePermissions();
  const [view, setView] = useState<View_>({ name: 'home' });
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<Sheet>(null);
  const [query, setQuery] = useState('');
  const catalog = useMemo(() => [...loadWorkTitles()].map(([id, title]) => ({ id, title })), []);
  const stats = draftStats(draft);
  const inDraft = new Set(draft.map((d) => d.workId));

  const run = async (uris: string[], format: 'physical' | 'digital', source: Source) => {
    setView({ name: 'working', note: 'Preparing your photo…' });
    const images = await prepareForScan(uris);
    if (images.length === 0) { setView({ name: 'error', kind: 'no_photo', message: 'That photo couldn’t be read. Please try another.' }); return; }
    setView({ name: 'working', note: 'Reading your comics… this uses your AI key once.' });
    const res = await scanPhotos(ai.config, images);
    if (!res.ok) { feedback.warning(); setView({ name: 'error', kind: res.kind, message: res.message }); return; }
    const matches = matchScannedBooks(res.data.books, catalog);
    setTicked(defaultSelection(matches));
    feedback.success();
    setView({ name: 'review', matches, summary: summarizeScan(matches, res.data.unreadable), format, source });
  };

  const fromCamera = async () => {
    if (!(await perms.ensure('camera'))) return;
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (!r.canceled && r.assets?.length) await run(r.assets.map((a) => a.uri), 'physical', 'shelf_scan');
  };
  const fromLibrary = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS, quality: 1 });
    if (!r.canceled && r.assets?.length) await run(r.assets.map((a) => a.uri), 'digital', 'screenshot');
  };

  const confirmScan = (v: Extract<View_, { name: 'review' }>) => {
    const incoming: DraftItem[] = v.matches
      .filter((m) => m.workId && m.status !== 'unmatched' && ticked.has(m.workId))
      .map((m) => ({ workId: m.workId!, title: m.workTitle ?? m.scanned.title, ownership: v.format, reading: 'unread' as const, source: v.source }));
    setDraft(addItems(draft, incoming));
    setView({ name: 'home' });
  };

  const addManual = (workId: string, title: string) => {
    if (inDraft.has(workId)) { setDraft(removeItems(draft, new Set([workId]))); return; }
    feedback.select();
    setDraft(addItems(draft, [{ workId, title, ownership: 'physical', reading: 'unread', source: 'manual' }]));
  };

  const applySheet = (value: string) => {
    if (!sheet) return;
    const ids = new Set(sheet.ids);
    setDraft(patchItems(draft, ids, sheet.kind === 'own' ? { ownership: value as Ownership } : { reading: value as ReadingState }));
    setSheet(null);
    setPicking(false);
    setChosen(new Set());
  };

  const toggleChosen = (id: string) => setChosen((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // ---- sub-views ----------------------------------------------------------------

  if (view.name === 'working') {
    return (
      <StageFrame title="Reading your shelf" onBack={null}>
        <View style={styles.center}>
          <ActivityIndicator color={c.primary} size="large" />
          <Text accessibilityLiveRegion="polite" style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>{view.note}</Text>
        </View>
      </StageFrame>
    );
  }

  if (view.name === 'error') {
    return (
      <StageFrame title="That didn’t work." onBack={() => setView({ name: 'home' })}>
        <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>{view.message}</Text>
        <View style={styles.gap}>
          {view.kind === 'unauthorized' || view.kind === 'model_not_found' ? <Button onPress={() => router.push('/ai-settings')}>Check AI settings</Button> : null}
          <Button kind="secondary" onPress={() => setView({ name: 'home' })}>Back</Button>
        </View>
      </StageFrame>
    );
  }

  if (view.name === 'review') {
    const found = view.matches.filter((m) => m.workId && m.status !== 'unmatched');
    const missing = view.matches.filter((m) => !m.workId || m.status === 'unmatched');
    const n = found.filter((m) => ticked.has(m.workId!)).length;
    return (
      <StageFrame
        title="Is this right?" subtitle="Untick anything that’s wrong. Nothing is added until you confirm." onBack={() => setView({ name: 'home' })}
        primaryLabel={n ? `Add ${n} to my list` : 'Nothing to add'} primaryDisabled={n === 0} onPrimary={() => confirmScan(view)}
        onSkip={() => setView({ name: 'home' })} skipLabel="Discard this scan"
      >
        {found.length === 0 ? (
          <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>
            {view.summary.unreadable ? `I could see ${view.summary.unreadable} I couldn’t read. Try a closer, brighter photo of the spines.` : 'I couldn’t make out any comics in that photo. Try a closer, brighter one.'}
          </Text>
        ) : null}
        <View style={styles.gap}>
          {found.map((m) => {
            const on = ticked.has(m.workId!);
            return (
              <Pressable
                key={m.workId} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${m.workTitle}, ${m.status === 'matched' ? 'matched' : 'check this one'}`}
                onPress={() => setTicked((cur) => { const nx = new Set(cur); if (nx.has(m.workId!)) nx.delete(m.workId!); else nx.add(m.workId!); return nx; })}
                style={[styles.row, { borderColor: on ? c.primary : c.border, backgroundColor: c.surface }]}
              >
                <Text style={[styles.tick, { color: on ? c.primary : c.textMuted }]}>{on ? '✓' : '○'}</Text>
                <ComicCover title={m.workTitle!} workId={m.workId!} size="tiny" recyclingKey={`onb-scan-${m.workId}`} />
                <View style={styles.flex}>
                  <Text numberOfLines={2} style={[styles.rowTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{m.workTitle}</Text>
                  <Text style={[styles.note, { color: m.status === 'matched' ? c.success : c.warning, fontFamily: typography.bodyMedium }]}>{m.status === 'matched' ? 'Matched' : 'Check this one'}</Text>
                  {m.status === 'review' ? <Text style={[styles.note, { color: c.textMuted, fontFamily: typography.body }]}>You scanned: {m.scanned.title}</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        {missing.length ? (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Eyebrow>Not in the catalog yet</Eyebrow>
            {missing.map((m, i) => <Text key={`${m.scanned.title}${i}`} style={[styles.note, { color: c.textSecondary, fontFamily: typography.body }]}>• {m.scanned.title}</Text>)}
          </View>
        ) : null}
      </StageFrame>
    );
  }

  if (view.name === 'search') {
    const results = query.trim() ? searchWorks(query, 12) : [];
    return (
      <StageFrame title="Search your comics" subtitle="Tap a book to add it. Tap again to take it out." onBack={() => { setQuery(''); setView({ name: 'home' }); }} primaryLabel={`Done${draft.length ? ` (${draft.length})` : ''}`} onPrimary={() => { setQuery(''); setView({ name: 'home' }); }}>
        <TextField label="Title, character or creator" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} placeholder="e.g. Batman Year One" />
        <View style={styles.gap}>
          {query.trim() && results.length === 0 ? <Text style={[styles.note, { color: c.textMuted, fontFamily: typography.body }]}>Nothing found. Try a shorter search.</Text> : null}
          {results.map((r) => {
            const on = inDraft.has(r.workId);
            return (
              <Pressable key={r.workId} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={r.title} onPress={() => addManual(r.workId, r.title)}
                style={[styles.row, { borderColor: on ? c.primary : c.border, backgroundColor: c.surface }]}>
                <ComicCover title={r.title} workId={r.workId} size="tiny" recyclingKey={`onb-search-${r.workId}`} />
                <View style={styles.flex}>
                  <Text numberOfLines={2} style={[styles.rowTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{r.title}</Text>
                  <Text numberOfLines={1} style={[styles.note, { color: c.textMuted, fontFamily: typography.body }]}>{r.creators.slice(0, 2).join(', ')}</Text>
                </View>
                <Text style={{ color: on ? c.primary : c.textMuted, fontSize: 22 }}>{on ? '✓' : '＋'}</Text>
              </Pressable>
            );
          })}
        </View>
      </StageFrame>
    );
  }

  // ---- home ---------------------------------------------------------------------

  const hasKey = !!ai.config;
  return (
    <StageFrame
      title="Now, your comics." subtitle="Add what you own so recommendations start from your shelf. All optional — you can do this any time." onBack={onBack}
      primaryLabel={draft.length ? `Save ${draft.length} ${draft.length === 1 ? 'book' : 'books'} to my library` : 'Continue without adding'} primaryDisabled={saving} onPrimary={onSave}
      onSkip={draft.length ? onSkip : undefined} skipLabel="Skip and don’t save these"
    >
      <View style={styles.gap}>
        {hasKey ? (
          <>
            <Button onPress={fromCamera}>Scan my shelf with the camera</Button>
            <Button kind="secondary" onPress={fromLibrary}>Import screenshots of a digital library</Button>
          </>
        ) : (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Eyebrow>Scanning needs an AI key</Eyebrow>
            <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>
              Reading a photo uses your own API key, set up in Settings. It takes a minute — or just search and add books by hand.
            </Text>
            <Button kind="secondary" onPress={() => router.push('/ai-settings')}>Set up AI assistant</Button>
          </View>
        )}
        <Button kind="secondary" onPress={() => setView({ name: 'search' })}>Search and add by hand</Button>
      </View>

      {draft.length > 0 ? (
        <View style={styles.list}>
          <View style={styles.listHead}>
            <Text style={[styles.count, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{stats.total} to add</Text>
            <Pill label={picking ? 'Done' : 'Select several'} active={picking} onPress={() => { setPicking((p) => !p); setChosen(new Set()); }} />
          </View>
          {picking ? (
            <View style={styles.bulk}>
              <Button kind="secondary" style={styles.bulkBtn} disabled={chosen.size === 0} onPress={() => setSheet({ kind: 'own', ids: [...chosen] })}>Set ownership</Button>
              <Button kind="secondary" style={styles.bulkBtn} disabled={chosen.size === 0} onPress={() => setSheet({ kind: 'read', ids: [...chosen] })}>Set status</Button>
              <Button kind="ghost" style={styles.bulkBtn} disabled={chosen.size === 0} onPress={() => { setDraft(removeItems(draft, chosen)); setChosen(new Set()); }}>Remove</Button>
            </View>
          ) : null}
          {draft.map((d) => {
            const on = chosen.has(d.workId);
            return (
              <View key={d.workId} style={[styles.row, { borderColor: picking && on ? c.primary : c.border, backgroundColor: c.surface }]}>
                {picking ? (
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Select ${d.title}`} hitSlop={8} onPress={() => toggleChosen(d.workId)}>
                    <Text style={[styles.tick, { color: on ? c.primary : c.textMuted }]}>{on ? '✓' : '○'}</Text>
                  </Pressable>
                ) : null}
                <ComicCover title={d.title} workId={d.workId} size="tiny" recyclingKey={`onb-draft-${d.workId}`} />
                <View style={styles.flex}>
                  <Text numberOfLines={2} style={[styles.rowTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{d.title}</Text>
                  <View style={styles.chips}>
                    <Pill label={OWNERSHIP_LABEL[d.ownership]} onPress={() => setSheet({ kind: 'own', ids: [d.workId] })} />
                    <Pill label={READING_LABEL[d.reading]} onPress={() => setSheet({ kind: 'read', ids: [d.workId] })} />
                  </View>
                </View>
                {!picking ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${d.title}`} hitSlop={10} onPress={() => setDraft(removeItems(draft, new Set([d.workId])))}>
                    <Text style={[styles.tick, { color: c.textMuted }]}>✕</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      <ChoiceSheet<string>
        visible={!!sheet} title={sheet?.kind === 'own' ? 'Where do you have it?' : 'Where are you with it?'}
        message={sheet && sheet.ids.length > 1 ? `Applies to ${sheet.ids.length} books.` : undefined}
        choices={sheet?.kind === 'own' ? OWN_CHOICES : READ_CHOICES}
        selected={sheet && sheet.ids.length === 1 ? (sheet.kind === 'own' ? draft.find((d) => d.workId === sheet.ids[0])?.ownership : draft.find((d) => d.workId === sheet.ids[0])?.reading) ?? null : null}
        onSelect={applySheet} onClose={() => setSheet(null)}
        footnote={sheet?.kind === 'own' ? 'Owning a book doesn’t mean you like it — it only tells ComicPill what you can read.' : 'Finished doesn’t mean loved. You can rate it later.'}
      />
    </StageFrame>
  );
}


const styles = StyleSheet.create({
  gap: { gap: space.md },
  center: { alignItems: 'center', gap: space.md, paddingVertical: 64 },
  flex: { flex: 1, minWidth: 0, gap: 4 },
  card: { borderWidth: 1, borderRadius: 16, padding: space.lg, gap: space.md },
  body: { fontSize: 14, lineHeight: 21 },
  note: { fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderRadius: 14, padding: space.md },
  rowTitle: { fontSize: 15 },
  tick: { fontSize: 22, width: 26, textAlign: 'center' },
  list: { marginTop: space.xl, gap: space.md },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { fontSize: 18 },
  bulk: { flexDirection: 'row', gap: 8 },
  bulkBtn: { flex: 1, paddingHorizontal: 6 },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
});
