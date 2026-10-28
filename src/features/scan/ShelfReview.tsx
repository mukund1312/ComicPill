import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { Button, Pill } from '../../ui/primitives';
import { ComicCover } from '../../ui/comic';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { SpineOverlay } from './SpineOverlay';
import { EditMatchSheet } from './EditMatchSheet';
import { SpinePeek } from './SpinePeek';
import { chooseMatch, confirmAllMatched, duplicateWithinScan, excludeItem, needsAttention, repeatNumber, replace, summarize, type Box, type Ownership, type ReadingState, type ScanItem } from '../../lib/scan/session';

type Props = {
  scan: { photoUri: string; photoWidth: number; photoHeight: number };
  items: ScanItem[]; onItems: (next: ScanItem[]) => void;
  alreadyOwned: (workId: string) => boolean;
  onImport: () => void; onAddRegion: (box: Box) => Promise<void>; onAgain: () => void;
};

/**
 * The review: the shelf photo with a numbered box on every book, and a card for each one showing its spine, the catalog cover it matched, and
 * what to do about it. Confident matches are ready to go; only the uncertain ones ask for attention.
 */
export function ShelfReview({ scan, items, onItems, alreadyOwned, onImport, onAddRegion, onAgain }: Props) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const { width } = useWindowDimensions();
  const wide = width >= 900; // an iPad: the photo beside the list
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [peekIndex, setPeekIndex] = useState<number | null>(null); // the book being looked at large
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(true);
  const scroll = useRef<ScrollView>(null);
  const spots = useRef(new Map<string, number>());
  const sum = summarize(items);
  const dupes = duplicateWithinScan(items);

  const select = (id: string) => { setSelectedId(id); const y = spots.current.get(id); if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - 12), animated: true }); };
  const setAll = (patch: { ownership?: Ownership; reading?: ReadingState }) => onItems(items.map((i) => ({ ...i, ...patch })));
  const editing = items.find((i) => i.scanId === editingId) ?? null;
  const visible = items.map((item, index) => ({ item, index })).filter(({ item }) => !onlyAttention || (item.status !== 'excluded' && needsAttention(item)));
  const bulkOwnership = items.length && items.every((i) => i.ownership === items[0].ownership) ? items[0].ownership : null;
  const bulkReading = items.length && items.every((i) => i.reading === items[0].reading) ? items[0].reading : null;

  const photo = (
    <View style={wide ? styles.photoWide : undefined}>
      {photoOpen ? <SpineOverlay uri={scan.photoUri} width={scan.photoWidth} height={scan.photoHeight} items={items} selectedId={selectedId} onSelect={select} drawing={drawing} onDrawn={(box) => { setDrawing(false); setAdding(true); void onAddRegion(box).finally(() => setAdding(false)); }} /> : null}
      <View style={styles.photoBar}>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setPhotoOpen((o) => !o)}><Text style={[styles.link, { color: c.primary, fontFamily: typography.bodySemibold }]}>{photoOpen ? 'Hide photo' : 'Show photo'}</Text></Pressable>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { setPhotoOpen(true); setDrawing((d) => !d); }}><Text style={[styles.link, { color: drawing ? c.warning : c.primary, fontFamily: typography.bodySemibold }]}>{drawing ? 'Cancel drawing' : 'Add a missed book'}</Text></Pressable>
      </View>
      {drawing ? <Text style={[styles.note, { color: c.textSecondary, fontFamily: typography.body }]}>Drag a box around the book that was missed.</Text> : null}
      {adding ? <View style={styles.adding}><ActivityIndicator color={c.primary} /><Text style={[styles.note, { color: c.textSecondary, fontFamily: typography.body }]}>Reading that book…</Text></View> : null}
    </View>
  );

  const list = (
    <View style={[styles.gap, wide && styles.listWide]}>
      <Text style={[styles.summary, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>
        {sum.total} detected · {sum.ready} ready{sum.needsAttention ? ` · ${sum.needsAttention} need a look` : ''}{sum.excluded ? ` · ${sum.excluded} left out` : ''}
      </Text>
      <Text style={[styles.label, { color: c.textMuted, fontFamily: typography.body }]}>Copies of everything in this scan</Text>
      <View style={styles.pills}>
        <Pill label="Physical" active={bulkOwnership === 'physical'} onPress={() => setAll({ ownership: 'physical' })} />
        <Pill label="Digital" active={bulkOwnership === 'digital'} onPress={() => setAll({ ownership: 'digital' })} />
        <Pill label="Unread" active={bulkReading === 'unread'} onPress={() => setAll({ reading: 'unread' })} />
        <Pill label="Reading" active={bulkReading === 'reading'} onPress={() => setAll({ reading: 'reading' })} />
        <Pill label="Completed" active={bulkReading === 'completed'} onPress={() => setAll({ reading: 'completed' })} />
      </View>
      <View style={styles.pills}>
        <Pill label="Confirm all matched" active={false} onPress={() => onItems(confirmAllMatched(items))} />
        <Pill label={onlyAttention ? 'Showing: needs a look' : 'Show only what needs a look'} active={onlyAttention} onPress={() => setOnlyAttention((v) => !v)} />
      </View>

      {visible.length === 0 ? <Text style={[styles.note, { color: c.textSecondary, fontFamily: typography.body }]}>Nothing needs a look. Everything is matched.</Text> : null}
      {visible.map(({ item, index }) => {
        const sel = item.selected;
        const title = sel ? (sel.kind === 'catalog' ? sel.title : sel.comic.title) : item.read.title || 'Couldn’t read this one';
        const workId = sel?.kind === 'catalog' ? sel.workId : undefined;
        const owned = !!workId && alreadyOwned(workId);
        const excluded = item.status === 'excluded';
        const best = item.candidates[0];
        const repeats = repeatNumber(items, item);
        const status = excluded ? { text: 'Left out', tone: c.textMuted }
          : repeats ? { text: `Same title as book ${repeats}. Another volume? Choose which.`, tone: c.warning }
          : dupes.has(item.scanId) ? { text: 'Same book as another in this scan. It will be added once.', tone: c.warning }
          : item.status === 'manually_verified' ? { text: sel?.kind === 'custom' ? 'Added by you' : 'Confirmed', tone: c.success }
          : item.status === 'matched' ? { text: `Catalog match · ${item.strength === 'strong' ? 'Strong' : 'Likely'}`, tone: c.success }
          : item.status === 'needs_review' ? { text: best ? `Choose a match · maybe ${best.title}` : 'Choose a match', tone: c.warning }
          : { text: 'Not found. Search or add it yourself.', tone: c.warning };
        return (
          <Pressable key={item.scanId} onLayout={(e) => spots.current.set(item.scanId, e.nativeEvent.layout.y)} onPress={() => setSelectedId(item.scanId)} accessibilityRole="button"
            style={[styles.card, { borderColor: selectedId === item.scanId ? c.primary : c.border, backgroundColor: c.surface, opacity: excluded ? 0.55 : 1 }]}>
            <View style={styles.top}>
              <View style={[styles.num, { backgroundColor: c.surfaceRaised }]}><Text style={[styles.numText, { color: c.textPrimary }]}>{index + 1}</Text></View>
              {/* Tap the spine to see it large, with its place on the shelf, and decide there. */}
              <Pressable accessibilityRole="button" accessibilityLabel={`Enlarge book ${index + 1}`} hitSlop={6} onPress={() => setPeekIndex(index)}>
                {item.cropUri ? <Image source={{ uri: item.cropUri }} style={[styles.spine, { backgroundColor: c.surfaceRaised }]} contentFit="cover" /> : <View style={[styles.spine, { backgroundColor: c.surfaceRaised }]} />}
                <View pointerEvents="none" style={[styles.zoomBadge, { backgroundColor: '#000000AA' }]}><Text style={styles.zoomText}>⤢</Text></View>
              </Pressable>
              <Text style={[styles.arrow, { color: c.textMuted }]}>→</Text>
              {item.customCoverUri ? <Image source={{ uri: item.customCoverUri }} style={styles.cover} contentFit="cover" /> : <ComicCover title={title} workId={workId} size="list" recyclingKey={`scan-${item.scanId}`} />}
              <View style={styles.flex}>
                <Text numberOfLines={3} style={[styles.title, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{title}</Text>
                <Text style={[styles.note, { color: status.tone, fontFamily: typography.bodyMedium }]}>{status.text}</Text>
                {item.editionUncertain && !excluded ? <Text style={[styles.note, { color: c.warning, fontFamily: typography.bodySemibold }]}>Edition uncertain. Confirm which one you have.</Text> : null}
                {owned && !excluded ? <Text style={[styles.note, { color: c.warning, fontFamily: typography.bodySemibold }]}>Already in your library</Text> : null}
              </View>
            </View>
            {owned && !excluded ? (
              <View style={styles.pills}>
                <Pill label="Skip it" active={item.onDuplicate === 'skip'} onPress={() => onItems(replace(items, item.scanId, { onDuplicate: 'skip' }))} />
                <Pill label="Update my entry" active={item.onDuplicate === 'update'} onPress={() => onItems(replace(items, item.scanId, { onDuplicate: 'update' }))} />
              </View>
            ) : null}
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setEditingId(item.scanId)}><Text style={[styles.link, { color: c.primary, fontFamily: typography.bodySemibold }]}>{item.status === 'matched' || item.status === 'manually_verified' ? 'Edit match' : 'Find'}</Text></Pressable>
              {item.status === 'matched' && !excluded ? <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onItems(replace(items, item.scanId, { status: 'manually_verified' }))}><Text style={[styles.link, { color: c.success, fontFamily: typography.bodySemibold }]}>Confirm</Text></Pressable> : null}
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onItems(excludeItem(items, item.scanId, !excluded))}><Text style={[styles.link, { color: excluded ? c.primary : c.textMuted, fontFamily: typography.bodySemibold }]}>{excluded ? 'Include again' : 'Leave out'}</Text></Pressable>
            </View>
          </Pressable>
        );
      })}

      <Button onPress={onImport} disabled={sum.ready === 0}>{sum.ready === 0 ? 'Nothing ready to add yet' : `Add ${sum.ready} selected ${sum.ready === 1 ? 'comic' : 'comics'} to my library`}</Button>
      <Button kind="ghost" onPress={onAgain}>Scan another shelf</Button>
    </View>
  );

  return (
    <>
      <ScrollView ref={scroll} contentContainerStyle={styles.page} scrollEnabled={!drawing}>
        {wide ? <View style={styles.cols}>{photo}{list}</View> : <>{photo}{list}</>}
      </ScrollView>
      {peekIndex !== null ? (
        <SpinePeek
          items={items} index={Math.min(peekIndex, items.length - 1)} photo={scan} alreadyOwned={alreadyOwned}
          onIndex={(i) => { setPeekIndex(i); setSelectedId(items[i]?.scanId ?? null); }} onClose={() => setPeekIndex(null)}
          onConfirm={(id) => onItems(replace(items, id, { status: 'manually_verified' }))}
          onEdit={(id) => setEditingId(id)}
          onExclude={(id, ex) => onItems(excludeItem(items, id, ex))}
        />
      ) : null}
      {editing ? (
        <EditMatchSheet
          item={editing} number={items.findIndex((i) => i.scanId === editing.scanId) + 1}
          onClose={() => setEditingId(null)}
          onChoose={(s, cover) => { onItems(chooseMatch(cover === undefined ? items : replace(items, editing.scanId, { customCoverUri: cover }), editing.scanId, s)); setEditingId(null); }}
          onCover={(uri) => onItems(replace(items, editing.scanId, { customCoverUri: uri }))}
          onExclude={(ex) => onItems(excludeItem(items, editing.scanId, ex))}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 60 },
  cols: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
  photoWide: { width: '42%' },
  listWide: { flex: 1, marginTop: 0 },
  gap: { gap: space.md, marginTop: space.md },
  photoBar: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: space.sm },
  adding: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.sm },
  summary: { fontSize: 17 },
  label: { fontSize: 12 },
  note: { fontSize: 12, lineHeight: 17 },
  link: { fontSize: 14 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { borderWidth: 1, borderRadius: 16, padding: space.md, gap: space.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  num: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: 12, fontWeight: '700' },
  spine: { width: 40, height: 100, borderRadius: 6 },
  zoomBadge: { position: 'absolute', right: 2, bottom: 2, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  zoomText: { color: '#fff', fontSize: 11 },
  cover: { width: 58, height: 86, borderRadius: 9 },
  arrow: { fontSize: 18 },
  flex: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 15, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: space.xl, paddingTop: 2 },
});
