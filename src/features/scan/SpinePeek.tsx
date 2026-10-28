import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Button } from '../../ui/primitives';
import { ComicCover } from '../../ui/comic';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { SpineOverlay } from './SpineOverlay';
import { repeatNumber, type ScanItem } from '../../lib/scan/session';

/**
 * One book, large: its spine picture (pinch to zoom), where it sits on the shelf photo, what the scan read and what it matched. The decision can be
 * made right here, and Previous / Next step through the books, so nothing has to be remembered or looked up by number in a long list.
 */
export function SpinePeek({ items, index, photo, alreadyOwned, onIndex, onClose, onConfirm, onEdit, onExclude }: {
  items: ScanItem[]; index: number; photo: { photoUri: string; photoWidth: number; photoHeight: number };
  alreadyOwned: (workId: string) => boolean; onIndex: (i: number) => void; onClose: () => void;
  onConfirm: (scanId: string) => void; onEdit: (scanId: string) => void; onExclude: (scanId: string, excluded: boolean) => void;
}) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const { height } = useWindowDimensions();
  const item = items[index];
  if (!item) return null;
  const sel = item.selected;
  const title = sel ? (sel.kind === 'catalog' ? sel.title : sel.comic.title) : item.read.title || 'Couldn’t read this one';
  const workId = sel?.kind === 'catalog' ? sel.workId : undefined;
  const repeats = repeatNumber(items, item);
  const excluded = item.status === 'excluded';
  const status = excluded ? 'Left out'
    : repeats ? `Same title as book ${repeats}. Is it another volume? Choose which.`
    : item.status === 'manually_verified' ? (sel?.kind === 'custom' ? 'Added by you' : 'Confirmed')
    : item.status === 'matched' ? `Catalog match · ${item.strength === 'strong' ? 'Strong' : 'Likely'}`
    : item.status === 'needs_review' ? (item.candidates[0] ? `Choose a match · maybe ${item.candidates[0].title}` : 'Choose a match') : 'Not found';
  const go = (d: number) => onIndex((index + d + items.length) % items.length);

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.page, { backgroundColor: c.background }]}>
        <View style={styles.bar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous book" hitSlop={12} onPress={() => go(-1)}><Text style={[styles.nav, { color: c.primary, fontFamily: typography.bodySemibold }]}>‹ Previous</Text></Pressable>
          <Text style={[styles.count, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>Book {index + 1} of {items.length}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Next book" hitSlop={12} onPress={() => go(1)}><Text style={[styles.nav, { color: c.primary, fontFamily: typography.bodySemibold }]}>Next ›</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <View style={[styles.shelf, { maxHeight: Math.round(height * 0.45), backgroundColor: c.surfaceRaised }]}>
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
              <SpineOverlay uri={photo.photoUri} width={photo.photoWidth} height={photo.photoHeight} items={items} selectedId={item.scanId} onSelect={(id) => { const i = items.findIndex((x) => x.scanId === id); if (i >= 0) onIndex(i); }} drawing={false} onDrawn={() => undefined} />
            </ScrollView>
          </View>

          <View style={styles.row}>
            <View style={styles.left}>
              <View style={styles.bigCover}><ComicCover title={title} workId={workId} size="fluid" recyclingKey={`peek-${item.scanId}`} /></View>
              <Text style={[styles.title, { color: c.textPrimary, fontFamily: typography.display }]}>{title}</Text>
              <Text style={[styles.status, { color: repeats || item.status === 'needs_review' || item.status === 'unmatched' ? c.warning : c.success, fontFamily: typography.bodyMedium }]}>{status}</Text>
              {item.editionUncertain && !excluded ? <Text style={[styles.status, { color: c.warning, fontFamily: typography.bodySemibold }]}>Edition uncertain. Confirm which one you have.</Text> : null}
              {workId && alreadyOwned(workId) && !excluded ? <Text style={[styles.status, { color: c.warning, fontFamily: typography.bodySemibold }]}>Already in your library</Text> : null}
              <Text style={[styles.hint, { color: c.textMuted, fontFamily: typography.body }]}>The scan read: {item.extractedText.join(' · ') || 'nothing readable'}</Text>
            </View>
            <View style={[styles.spine, { backgroundColor: c.surfaceRaised }]}>
              {item.cropUri
                ? <Image source={{ uri: item.cropUri }} style={styles.spineImage} contentFit="contain" accessibilityLabel={`Spine of book ${index + 1}`} />
                : <Text style={{ color: c.textMuted, fontSize: 12 }}>No picture of this spine.</Text>}
            </View>
          </View>

          <View style={styles.actions}>
            {item.status === 'matched' && !excluded ? <Button onPress={() => { onConfirm(item.scanId); go(1); }}>Confirm and go to the next</Button> : null}
            <Button kind="secondary" onPress={() => { onClose(); onEdit(item.scanId); }}>{item.status === 'matched' || item.status === 'manually_verified' ? 'Edit match' : 'Find the right comic'}</Button>
            <Button kind="ghost" onPress={() => { onExclude(item.scanId, !excluded); }}>{excluded ? 'Include this book again' : 'Leave this book out'}</Button>
          </View>
        </ScrollView>
        <View style={styles.footer}><Button kind="ghost" onPress={onClose}>Back to the list</Button></View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingTop: 54 },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.lg, paddingBottom: space.sm },
  nav: { fontSize: 16 }, count: { fontSize: 16 },
  body: { padding: space.lg, gap: space.sm, paddingBottom: 30 },
  shelf: { borderRadius: 14, overflow: 'hidden' },
  hint: { fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', marginTop: space.sm },
  left: { flex: 1, gap: space.xs },
  bigCover: { width: '78%', maxWidth: 300 },
  // The spine stands upright, as it does on the shelf: the strip is turned a quarter so its lettering reads up the page.
  spine: { width: 120, height: 380, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  spineImage: { width: 370, height: 110, transform: [{ rotate: '-90deg' }] },
  title: { fontSize: 22, marginTop: space.sm },
  status: { fontSize: 14, lineHeight: 20 },
  actions: { gap: space.sm, marginTop: space.md },
  footer: { paddingHorizontal: space.lg, paddingBottom: 24 },
});
