import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Button } from '../../ui/primitives';
import { ComicCover } from '../../ui/comic';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { needsAttention, summarize, type ScanItem } from '../../lib/scan/session';

const nameOf = (i: ScanItem) => (i.selected ? (i.selected.kind === 'catalog' ? i.selected.title : i.selected.comic.title) : i.read.title || 'Unknown book');

/** What happened to each book: added, already there, failed (with a retry for just those), or still waiting on the reader. */
export function ImportResult({ items, onRetry, onFinish, retrying, finishLabel = 'OK, open my library' }: { items: ScanItem[]; onRetry: () => void; onFinish: (keepPhoto: boolean) => void; retrying: boolean; finishLabel?: string }) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const [keep, setKeep] = useState(false);
  const s = summarize(items);
  const added = items.filter((i) => i.importState === 'imported' || i.importState === 'updated');
  const skipped = items.filter((i) => i.importState === 'skipped');
  const failed = items.filter((i) => i.importState === 'failed');
  const waiting = items.filter((i) => i.importState === 'pending' && i.status !== 'excluded' && needsAttention(i));

  return (
    <View style={styles.gap}>
      <Text style={[styles.h, { color: c.textPrimary, fontFamily: typography.display }]}>{s.imported ? `${s.imported} ${s.imported === 1 ? 'comic' : 'comics'} added` : 'Nothing was added'}</Text>
      {added.length ? (
        <View style={styles.gap}>
          {added.map((i) => (
            <View key={i.scanId} style={styles.row}>
              <ComicCover title={nameOf(i)} workId={i.selected?.kind === 'catalog' ? i.selected.workId : undefined} size="tiny" recyclingKey={`done-${i.scanId}`} />
              <Text numberOfLines={2} style={[styles.name, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{nameOf(i)}{i.importState === 'updated' ? '  · updated' : ''}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {skipped.length ? <Text style={[styles.note, { color: c.textSecondary, fontFamily: typography.body }]}>Skipped, already in your library or repeated in the scan: {skipped.map(nameOf).join(', ')}.</Text> : null}
      {failed.length ? (
        <View style={[styles.card, { borderColor: c.destructive, backgroundColor: c.surface }]}>
          <Text style={[styles.name, { color: c.destructive, fontFamily: typography.bodySemibold }]}>{failed.length} couldn’t be added</Text>
          {failed.map((i) => <Text key={i.scanId} style={[styles.note, { color: c.textSecondary, fontFamily: typography.body }]}>• {nameOf(i)}{i.error ? `: ${i.error}` : ''}</Text>)}
          <Button kind="secondary" onPress={onRetry} disabled={retrying}>{retrying ? 'Trying again…' : 'Try just these again'}</Button>
        </View>
      ) : null}
      {waiting.length ? <Text style={[styles.note, { color: c.warning, fontFamily: typography.body }]}>{waiting.length} {waiting.length === 1 ? 'book was' : 'books were'} not matched and not added: {waiting.map(nameOf).join(', ')}.</Text> : null}

      <View style={[styles.card, { borderColor: c.border, backgroundColor: c.surface }]}>
        <View style={styles.keepRow}>
          <View style={styles.flex}>
            <Text style={[styles.name, { color: c.textPrimary, fontFamily: typography.bodySemibold }]}>Keep the shelf photo for 7 days?</Text>
            <Text style={[styles.note, { color: c.textSecondary, fontFamily: typography.body }]}>Otherwise it is deleted from this device as soon as you tap OK. Your comics are already saved.</Text>
          </View>
          <Switch value={keep} onValueChange={setKeep} accessibilityLabel="Keep the shelf photo for 7 days" />
        </View>
      </View>
      <Button onPress={() => onFinish(keep)}>{finishLabel}</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md, marginTop: space.md },
  h: { fontSize: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { fontSize: 15, flexShrink: 1 },
  note: { fontSize: 13, lineHeight: 19 },
  card: { borderWidth: 1, borderRadius: 16, padding: space.md, gap: space.sm },
  keepRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1, minWidth: 0, gap: 2 },
});
