import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Button, Pill } from '../../ui/primitives';
import { ComicCover } from '../../ui/comic';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { matchScannedBooks, type CatalogTitle, type ScanMatch } from '../../lib/scan/match';
import { splitVolume } from '../../lib/scan/spines';
import { fullTitle } from '../../lib/scan/custom';
import type { ShelfFind } from '../../lib/scan/onDevice';
import type { ScanFormat } from '../../lib/scan/additions';

/** What the reader chose to add: a comic the catalog already knows, or a new entry made from the spine. */
export type ShelfPick = { kind: 'catalog'; workId: string } | { kind: 'new'; title: string; volume: string | null; creators: string[]; cropUri: string | null };

type Item = { key: string; find: ShelfFind; text: string; match: ScanMatch; selected: boolean };

const matchFor = (find: ShelfFind, title: string, volume: string | null, catalog: readonly CatalogTitle[]): ScanMatch =>
  matchScannedBooks([{ title, volume, creators: find.creators, confidence: find.confidence, seenAs: 'spine' }], catalog)[0];

/** The comics found on the shelf, each with a photo of its spine, to correct and tick before they go into the library. */
export function ShelfResults({ finds, catalog, onAdd, onAgain }: { finds: ShelfFind[]; catalog: readonly CatalogTitle[]; onAdd: (picks: ShelfPick[], format: ScanFormat) => void; onAgain: () => void }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const [format, setFormat] = useState<ScanFormat>('physical');
  const [items, setItems] = useState<Item[]>(() => finds.map((find, i) => {
    const match = matchFor(find, find.title, find.volume, catalog);
    return { key: `${i}`, find, text: fullTitle(find.title, find.volume), match, selected: find.confidence !== 'low' && match.status !== 'review' };
  }));
  const patch = (key: string, next: Partial<Item>) => setItems((cur) => cur.map((it) => (it.key === key ? { ...it, ...next } : it)));

  // Correcting a title looks the catalog up again with what was typed.
  const retitle = (it: Item) => {
    const { rest, volume } = splitVolume(it.text);
    patch(it.key, { match: matchFor(it.find, rest, volume, catalog), selected: rest.trim().length >= 2 });
  };
  const takeSuggestion = (it: Item) => patch(it.key, { match: { ...it.match, status: 'matched' }, selected: true, text: it.match.workTitle ?? it.text });

  const chosen = items.filter((it) => it.selected && it.text.trim().length >= 2);
  const picks = (): ShelfPick[] => chosen.map((it): ShelfPick => {
    if (it.match.status === 'matched' && it.match.workId) return { kind: 'catalog', workId: it.match.workId };
    const { rest, volume } = splitVolume(it.text);
    return { kind: 'new', title: rest, volume, creators: it.find.creators, cropUri: it.find.cropUri };
  });

  if (items.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={[styles.h2, { color: c.textPrimary, fontFamily: typography.display }]}>No comics found.</Text>
        <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>I couldn’t read any spines in that photo. Try standing back so a whole shelf fits, in good light, holding the phone level and without glare.</Text>
        <Button onPress={onAgain}>Try another photo</Button>
      </View>
    );
  }

  return (
    <View style={styles.gap}>
      <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>
        Found {items.length} {items.length === 1 ? 'comic' : 'comics'}. Check each title against its spine, fix any that are wrong, and untick any you don’t want. Nothing is added until you tap Add.
      </Text>
      <View style={styles.pills}>
        <Pill label="Physical copies" active={format === 'physical'} onPress={() => setFormat('physical')} />
        <Pill label="Digital copies" active={format === 'digital'} onPress={() => setFormat('digital')} />
      </View>

      {items.map((it) => {
        const status = it.match.status === 'matched' ? { text: `In the catalog${it.match.workTitle && it.match.workTitle !== it.text ? `: ${it.match.workTitle}` : ''}`, tone: c.success }
          : it.match.status === 'review' ? { text: `Maybe: ${it.match.workTitle}`, tone: c.warning }
          : it.find.confidence === 'low' ? { text: 'Hard to read. Please type the title.', tone: c.warning }
          : { text: 'New to your library. It will get its own entry.', tone: c.textMuted };
        return (
          <View key={it.key} style={[styles.row, { borderColor: it.selected ? c.primary : c.border, backgroundColor: c.surface }]}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: it.selected }} accessibilityLabel={`Add ${it.text}`} hitSlop={8} onPress={() => patch(it.key, { selected: !it.selected })}>
              <Text style={[styles.check, { color: it.selected ? c.primary : c.textMuted }]}>{it.selected ? '✓' : '○'}</Text>
            </Pressable>
            {it.find.cropUri ? <Image source={{ uri: it.find.cropUri }} style={[styles.spine, { backgroundColor: c.surfaceRaised }]} contentFit="cover" /> : it.match.workId ? <ComicCover title={it.match.workTitle ?? it.text} workId={it.match.workId} size="tiny" recyclingKey={`shelf-${it.key}`} /> : <View style={[styles.spine, { backgroundColor: c.surfaceRaised }]} />}
            <View style={styles.flex}>
              <TextInput
                value={it.text} onChangeText={(text) => patch(it.key, { text })} onEndEditing={() => retitle(it)}
                placeholder="Title" placeholderTextColor={c.textMuted} multiline accessibilityLabel="Title"
                style={[styles.title, { color: c.textPrimary, fontFamily: typography.displayMedium, borderColor: c.border }]}
              />
              <Text style={[styles.note, { color: status.tone, fontFamily: typography.bodyMedium }]}>{status.text}</Text>
              {it.match.status === 'review' ? <Pressable accessibilityRole="button" hitSlop={8} onPress={() => takeSuggestion(it)}><Text style={[styles.note, { color: c.primary, fontFamily: typography.bodySemibold }]}>Use “{it.match.workTitle}”</Text></Pressable> : null}
            </View>
          </View>
        );
      })}

      <Button onPress={() => onAdd(picks(), format)} disabled={chosen.length === 0}>{chosen.length === 0 ? 'Tick comics to add' : `Add ${chosen.length} to library`}</Button>
      <Button kind="ghost" onPress={onAgain}>Scan another shelf</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md, marginTop: space.lg },
  card: { borderWidth: 1, borderRadius: 16, padding: space.lg, gap: space.md, marginTop: space.lg },
  body: { fontSize: 14, lineHeight: 21 },
  note: { fontSize: 12, lineHeight: 17 },
  h2: { fontSize: 22 },
  pills: { flexDirection: 'row', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderRadius: 14, padding: space.md },
  flex: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 15, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  check: { fontSize: 22, width: 24, textAlign: 'center' },
  spine: { width: 46, height: 110, borderRadius: 6 },
});
