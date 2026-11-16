// One series on your shelf: its issues in reading order, each with its number and a thin progress ring, and one button for where to pick
// up (the issue you are in the middle of, or the first one you haven't finished).
import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { launchCover } from '../../ui/CoverLaunch';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AppShell } from '../../ui/AppShell';
import { PressableScale } from '../../ui/PressableScale';
import { ProgressRing } from '../../ui/ProgressRing';
import { useAppearance } from '../../ui/theme';
import { space, type } from '../../ui/tokens';
import { listReaderComics, type ReaderComic } from '../../lib/reader/readerLibrary';
import { isFinished, progressFraction } from '../../lib/reader/shelf';
import { seriesOf, sortIssues } from '../../lib/reader/series';

export default function SeriesScreen() {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const { key, folder } = useLocalSearchParams<{ key: string; folder?: string }>();
  const { width } = useWindowDimensions();
  const [all, setAll] = useState<ReaderComic[]>([]);
  useFocusEffect(useCallback(() => { setAll(listReaderComics()); }, []));
  const issues = useMemo(() => sortIssues(all.filter((comic) => !comic.locked && (comic.folderId ?? '') === (folder ?? '') && seriesOf(comic)?.key === key)), [all, key, folder]);
  const name = issues[0] ? seriesOf(issues[0])?.name ?? issues[0].title : 'Series';
  const read = issues.filter(isFinished).length;
  const pick = issues.find((comic) => progressFraction(comic) > 0 && !isFinished(comic)) ?? issues.find((comic) => !isFinished(comic)) ?? null;
  const pickNo = pick ? seriesOf(pick)?.number : null;
  const cols = width >= 700 ? 5 : 3; const gap = space.md;
  const cellW = Math.floor((Math.min(width, 900) - space.lg * 2 - gap * (cols - 1)) / cols);
  const covers = useRef(new Map<string, View>());
  const open = (comic: ReaderComic) => launchCover(covers.current.get(comic.id), comic.coverPath, () => router.push(`/reader/${comic.id}`));

  return (
    <AppShell active="library" back title={name}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.meta, { color: c.textSecondary, fontFamily: typography.body }]}>{`${issues.length} ${issues.length === 1 ? 'issue' : 'issues'} · ${read} read`}</Text>
        {pick ? (
          <PressableScale to={0.98} onPress={() => open(pick)} accessibilityRole="button" style={[styles.primary, { backgroundColor: c.primary }]}>
            <Text style={[styles.primaryText, { color: c.primaryForeground, fontFamily: typography.bodySemibold }]}>
              {progressFraction(pick) > 0 ? 'Continue' : read === 0 ? 'Start' : 'Read next'}{pickNo != null ? ` with #${pickNo}` : ''}
            </Text>
          </PressableScale>
        ) : null}
        <View style={[styles.grid, { gap }]}>
          {issues.map((comic, i) => {
            const no = seriesOf(comic)?.number;
            const done = isFinished(comic); const p = progressFraction(comic);
            return (
              <Animated.View key={comic.id} entering={FadeInDown.delay(Math.min(i, 12) * 30).duration(280)} style={{ width: cellW }}>
                <PressableScale to={0.96} onPress={() => open(comic)} accessibilityRole="button" accessibilityLabel={comic.title}>
                  <View ref={(v) => { if (v) covers.current.set(comic.id, v); else covers.current.delete(comic.id); }} collapsable={false} style={[styles.cover, { height: cellW * 1.5, backgroundColor: c.surfaceRaised }]}>
                    {comic.coverPath ? <Image source={{ uri: comic.coverPath }} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} recyclingKey={comic.id} /> : null}
                    {done || p > 0 ? <View style={styles.ring}><ProgressRing value={p} done={done} /></View> : null}
                  </View>
                  <Text numberOfLines={1} style={[styles.no, { color: done ? c.textMuted : c.textPrimary, fontFamily: typography.bodySemibold }]}>{no != null ? `#${no}` : comic.title}</Text>
                </PressableScale>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: 130 },
  meta: { fontSize: type.callout, marginBottom: space.lg },
  primary: { minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: space.xl },
  primaryText: { fontSize: type.body },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cover: { borderRadius: 12, overflow: 'hidden' },
  ring: { position: 'absolute', right: 6, bottom: 6 },
  no: { fontSize: type.callout, marginTop: space.sm },
});
