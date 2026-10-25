import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { AppShell } from '../../ui/AppShell';
import { EmptyState, Progress } from '../../ui/primitives';
import { color, font, radius, space, type } from '../../ui/tokens';
import { listReaderComics, type ReaderComic } from '../../lib/reader/readerLibrary';
import { pickAndImportComics, removeComic } from '../../lib/reader/importComics';

export default function ReaderShelfScreen() {
  const [comics, setComics] = useState<ReaderComic[]>([]);
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => { setComics(listReaderComics()); }, []));

  const onImport = async () => {
    setBusy(true);
    try {
      const result = await pickAndImportComics();
      setComics(listReaderComics());
      if (result.failed.length) Alert.alert('Some files could not be imported', result.failed.map((f) => `${f.name}: ${f.reason}`).join('\n\n'));
    } finally { setBusy(false); }
  };

  const onLongPress = (c: ReaderComic) => Alert.alert(c.title, undefined, [
    { text: 'Remove from device', style: 'destructive', onPress: () => { removeComic(c.id); setComics(listReaderComics()); } },
    { text: 'Cancel', style: 'cancel' },
  ]);

  return (
    <AppShell active="library" title="Read Files" right={<Pressable accessibilityRole="button" onPress={onImport} disabled={busy}><Text style={styles.add}>{busy ? '…' : '＋'}</Text></Pressable>}>
      <FlatList
        data={comics}
        numColumns={3}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.content}
        columnWrapperStyle={styles.row}
        ListEmptyComponent={<EmptyState title="No files yet" copy="Import CBZ, CBR, CB7, ZIP, PDF or comic EPUB files from your phone to read them here." action="Import comics" onAction={onImport} />}
        renderItem={({ item }) => (
          <Pressable style={styles.cell} onPress={() => router.push(`/reader/${item.id}`)} onLongPress={() => onLongPress(item)}>
            <View style={styles.cover}>{item.coverPath ? <Image source={{ uri: item.coverPath }} style={styles.coverImage} contentFit="cover" recyclingKey={item.id} /> : null}</View>
            <Text numberOfLines={2} style={styles.title}>{item.title}</Text>
            <Progress value={item.pageCount > 1 ? item.progressPage / (item.pageCount - 1) : 0} />
          </Pressable>
        )}
      />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 105 },
  row: { gap: space.md, marginBottom: space.lg },
  add: { color: color.accent, fontSize: 28 },
  cell: { flex: 1 / 3, gap: 6 },
  cover: { aspectRatio: 2 / 3, borderRadius: radius.sm, backgroundColor: color.surface2, overflow: 'hidden', borderWidth: 1, borderColor: color.border },
  coverImage: { width: '100%', height: '100%' },
  title: { color: color.text, fontFamily: font.displayMedium, fontSize: 12, lineHeight: 15 },
});
