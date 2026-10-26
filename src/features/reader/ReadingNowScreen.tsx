// "Reading Now": what you're in the middle of, and what you've finished. The first thing the Panels-style tab bar opens.
import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AppShell } from '../../ui/AppShell';
import { CoverStack } from '../../ui/CoverStack';
import { HeaderButton } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { Button, Progress } from '../../ui/primitives';
import { useAppearance } from '../../ui/theme';
import { space } from '../../ui/tokens';
import { listReaderComics, markComic, type ReaderComic } from '../../lib/reader/readerLibrary';
import { isFinished, progressFraction, readingNow } from '../../lib/reader/shelf';
import { isUnlocked } from '../../lib/reader/lock';
import { ActionSheet, type SheetOption } from './dialogs';

export default function ReadingNowScreen() {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const [comics, setComics] = useState<ReaderComic[]>([]);
  const [menu, setMenu] = useState<SheetOption[] | null>(null);
  const refresh = useCallback(() => setComics(listReaderComics()), []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const reading = useMemo(() => readingNow(comics), [comics]);
  const finished = useMemo(() => comics.filter(isFinished).sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0)), [comics]);
  const masked = (comic: ReaderComic) => comic.locked && !isUnlocked('comic', comic.id);
  const open = (comic: ReaderComic) => router.push(`/reader/${comic.id}`);

  const more = () => setMenu([
    { label: 'Open On My Phone', onPress: () => router.push('/reader/phone') },
    { label: 'Import files…', onPress: () => router.push('/library') },
    { label: 'Reader settings', onPress: () => router.push('/reader/settings') },
  ]);
  const comicMenu = (comic: ReaderComic) => setMenu([
    { label: 'Continue reading', onPress: () => open(comic) },
    { label: isFinished(comic) ? 'Mark as unread' : 'Mark as read', onPress: () => { markComic(comic.id, !isFinished(comic), comic.pageCount); refresh(); } },
    ...(comic.workId ? [{ label: 'Rate this comic…', onPress: () => router.push(`/check-in/${comic.workId}`) }] : []),
  ]);

  const hero = reading[0];
  return (
    <AppShell active="reading" title="Reading Now" right={<HeaderButton icon="ellipsis-horizontal" label="More" onPress={more} />}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {comics.length === 0 ? (
          <Animated.View entering={FadeInDown.duration(400)} style={styles.empty}>
            <CoverStack width={104} items={[{ title: 'Your next read' }, { title: 'Issue 2' }, { title: 'Issue 3' }]} />
            <Text style={[styles.emptyTitle, { color: c.textPrimary, fontFamily: typography.display }]}>Nothing here yet</Text>
            <Text style={[styles.emptyCopy, { color: c.textSecondary, fontFamily: typography.body }]}>Once you start reading, your currently reading and past read titles will appear here.</Text>
            <View style={{ alignSelf: 'stretch', marginTop: space.xl }}><Button onPress={() => router.push('/library')}>Add comics</Button></View>
          </Animated.View>
        ) : null}

        {hero ? (
          <Animated.View entering={FadeInDown.duration(380)}>
            <PressableScale to={0.98} style={[styles.hero, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => open(hero)} onLongPress={() => comicMenu(hero)}>
              {!masked(hero) && hero.coverPath ? <Image source={{ uri: hero.coverPath }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={36} /> : null}
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.background, opacity: 0.7 }]} />
              <View style={[styles.heroCover, { borderColor: c.border }]}>{!masked(hero) && hero.coverPath ? <Image source={{ uri: hero.coverPath }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>
              <View style={styles.heroBody}>
                <Text style={[styles.eyebrow, { color: c.textSecondary, fontFamily: typography.bodySemibold }]}>CONTINUE READING</Text>
                <Text numberOfLines={3} style={[styles.heroTitle, { color: c.textPrimary, fontFamily: typography.display }]}>{masked(hero) ? 'Locked comic' : hero.title}</Text>
                <Text style={[styles.sub, { color: c.textSecondary, fontFamily: typography.body }]}>Page {hero.progressPage + 1} of {hero.pageCount}</Text>
                <View style={{ marginTop: 12 }}><Progress value={progressFraction(hero)} /></View>
              </View>
            </PressableScale>
          </Animated.View>
        ) : null}

        {reading.length > 1 ? <Section title="Currently reading" comics={reading.slice(1)} masked={masked} onOpen={open} onMenu={comicMenu} showProgress /> : null}
        {finished.length ? <Section title="Finished" comics={finished} masked={masked} onOpen={open} onMenu={comicMenu} /> : null}
      </ScrollView>
      <ActionSheet visible={!!menu} options={menu ?? []} onClose={() => setMenu(null)} />
    </AppShell>
  );
}

function Section({ title, comics, masked, onOpen, onMenu, showProgress = false }: { title: string; comics: ReaderComic[]; masked: (c: ReaderComic) => boolean; onOpen: (c: ReaderComic) => void; onMenu: (c: ReaderComic) => void; showProgress?: boolean }) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  return (
    <Animated.View entering={FadeInDown.delay(120).duration(380)}>
      <Text style={[styles.section, { color: c.textPrimary, fontFamily: typography.display }]}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {comics.map((comic) => (
          <PressableScale key={comic.id} style={styles.card} onPress={() => onOpen(comic)} onLongPress={() => onMenu(comic)}>
            <View style={[styles.cover, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
              {!masked(comic) && comic.coverPath ? <Image source={{ uri: comic.coverPath }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={comic.id} /> : null}
            </View>
            <Text numberOfLines={2} style={[styles.cardTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{masked(comic) ? 'Locked comic' : comic.title}</Text>
            {showProgress ? <Progress value={progressFraction(comic)} /> : null}
          </PressableScale>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: 130 },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyTitle: { fontSize: 24, letterSpacing: -0.4, marginTop: 8 },
  emptyCopy: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 8, maxWidth: 300 },
  hero: { flexDirection: 'row', gap: 16, borderRadius: 28, borderWidth: 1, overflow: 'hidden', padding: 16, marginTop: 8 },
  heroCover: { width: 112, height: 168, borderRadius: 14, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  heroBody: { flex: 1, justifyContent: 'center' },
  eyebrow: { fontSize: 10, letterSpacing: 1.6 },
  heroTitle: { fontSize: 22, lineHeight: 26, marginTop: 6 },
  sub: { fontSize: 13, marginTop: 6 },
  section: { fontSize: 22, letterSpacing: -0.4, marginTop: 28, marginBottom: 12 },
  strip: { gap: 14 },
  card: { width: 128, gap: 8 },
  cover: { width: 128, height: 192, borderRadius: 14, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  cardTitle: { fontSize: 13, lineHeight: 17 },
});
