// One search box across your files, your collection and the whole catalog.
import { onMyDevice } from '../../lib/platform/device';
import { useMemo, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AppShell } from '../../ui/AppShell';
import { ComicCover } from '../../ui/comic';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { useAppearance } from '../../ui/theme';
import { space } from '../../ui/tokens';
import { sqlite } from '../../lib/db/client';
import { listReaderComics, type ReaderComic } from '../../lib/reader/readerLibrary';
import { matchesQuery } from '../../lib/reader/shelf';
import { Image } from 'expo-image';

type Hit = { id: string; title: string; own: string };

export default function SearchScreen() {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const [query, setQuery] = useState('');
  const q = query.trim();
  const files: ReaderComic[] = useMemo(() => (q ? listReaderComics().filter((comic) => !comic.locked && matchesQuery(comic, q)).slice(0, 20) : []), [q]);
  const works: Hit[] = useMemo(() => (q ? sqlite.getAllSync<Hit>(
    "SELECT w.id AS id, w.title AS title, COALESCE(l.own, 'none') AS own FROM works w LEFT JOIN user_library l ON l.work_id = w.id WHERE w.title LIKE ? AND w.id NOT LIKE 'file-%' ORDER BY (l.own IS NOT NULL AND l.own <> 'none') DESC, w.title LIMIT 40", `%${q}%`) : []), [q]);

  return (
    <AppShell active="search" title="Search">
      <View style={[styles.box, { backgroundColor: c.surfaceRaised }]}>
        <Icon name="search" size={18} color={c.textMuted} />
        <TextInput accessibilityLabel="Search" value={query} onChangeText={setQuery} placeholder="Comics, series, writers" placeholderTextColor={c.textMuted} returnKeyType="search" autoCorrect={false}
          style={[styles.input, { color: c.textPrimary, fontFamily: typography.body }]} onSubmitEditing={() => Keyboard.dismiss()} />
        {query ? <PressableScale to={0.9} onPress={() => setQuery('')} hitSlop={10}><Icon name="close-circle" size={18} color={c.textMuted} /></PressableScale> : null}
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
        {!q ? (
          <View style={styles.hint}><Icon name="search-outline" size={34} color={c.textMuted} /><Text style={[styles.hintText, { color: c.textSecondary, fontFamily: typography.body }]}>Search the comics on your phone and the whole catalog.</Text></View>
        ) : null}
        {q && files.length === 0 && works.length === 0 ? <Text style={[styles.hintText, { color: c.textSecondary, fontFamily: typography.body, marginTop: 40 }]}>No matches for “{q}”.</Text> : null}
        {files.length ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <Text style={[styles.section, { color: c.textPrimary, fontFamily: typography.display }]}>{onMyDevice()}</Text>
            {files.map((comic) => (
              <PressableScale key={comic.id} to={0.985} style={[styles.row, { borderBottomColor: c.border }]} onPress={() => router.push(`/reader/${comic.id}`)}>
                <View style={[styles.thumb, { backgroundColor: c.surfaceRaised }]}>{comic.coverPath ? <Image source={{ uri: comic.coverPath }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>
                <View style={{ flex: 1 }}><Text numberOfLines={2} style={[styles.title, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{comic.title}</Text><Text style={[styles.sub, { color: c.textMuted, fontFamily: typography.body }]}>{comic.pageCount} pages</Text></View>
                <Icon name="chevron-forward" size={18} color={c.textMuted} />
              </PressableScale>
            ))}
          </Animated.View>
        ) : null}
        {works.length ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <Text style={[styles.section, { color: c.textPrimary, fontFamily: typography.display }]}>Catalog</Text>
            {works.map((hit) => (
              <PressableScale key={hit.id} to={0.985} style={[styles.row, { borderBottomColor: c.border }]} onPress={() => router.push(`/comic/${hit.id}`)}>
                <ComicCover size="list" title={hit.title} workId={hit.id} />
                <View style={{ flex: 1 }}><Text numberOfLines={2} style={[styles.title, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{hit.title}</Text>{hit.own !== 'none' ? <Text style={[styles.sub, { color: c.success, fontFamily: typography.bodyMedium }]}>In your library</Text> : null}</View>
                <Icon name="chevron-forward" size={18} color={c.textMuted} />
              </PressableScale>
            ))}
          </Animated.View>
        ) : null}
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: space.lg, marginTop: 4, paddingHorizontal: 16, height: 52, borderRadius: 26 },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
  content: { paddingHorizontal: space.lg, paddingBottom: 130 },
  hint: { alignItems: 'center', gap: 12, marginTop: 70 },
  hintText: { fontSize: 15, textAlign: 'center', lineHeight: 22, maxWidth: 280 },
  section: { fontSize: 22, letterSpacing: -0.4, marginTop: 24, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  thumb: { width: 58, height: 86, borderRadius: 9, overflow: 'hidden' },
  title: { fontSize: 15, lineHeight: 19 },
  sub: { fontSize: 12.5, marginTop: 3 },
});
