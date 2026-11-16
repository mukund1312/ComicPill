// The end of a comic: the moment to offer the next issue, not a pop-up asking for a survey. Shown when the reader goes past the last page.
// A quiet five-star rating sits under the title (it also marks the comic finished in your library); the next issue in the series, when it
// is on your shelf, is the one big button.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppearance } from '../../ui/theme';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { space, type } from '../../ui/tokens';
import { feedback } from '../../lib/platform/feedback';
import type { ReaderComic } from '../../lib/reader/readerLibrary';
import { seriesOf } from '../../lib/reader/series';

type Props = {
  comic: ReaderComic;
  next: ReaderComic | null;
  /** The rating already given (1..5), if any. */
  rating: number | null;
  /** Null when this comic isn't linked to a library entry, so there is nowhere to keep a rating. */
  onRate: ((stars: number) => void) | null;
  onContinue: (next: ReaderComic) => void;
  onShelf: () => void;
  onStay: () => void;
};

export function EndOfIssue({ comic, next, rating, onRate, onContinue, onShelf, onStay }: Props) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const insets = useSafeAreaInsets();
  const [stars, setStars] = useState(rating ?? 0);
  const nextNo = next ? seriesOf(next)?.number : null;
  const rate = (n: number) => { feedback.select(); setStars(n); onRate?.(n); };
  return (
    <Animated.View entering={FadeIn.duration(240)} style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: c.background }]}>
      {comic.coverPath ? <Image source={{ uri: comic.coverPath }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} transition={300} /> : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: c.background, opacity: 0.82 }]} />
      <View style={[styles.body, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}>
        <Animated.View entering={FadeInDown.delay(80).duration(320)} style={styles.head}>
          <Text style={[styles.eyebrow, { color: c.textMuted, fontFamily: typography.bodySemibold }]}>YOU FINISHED</Text>
          <Text numberOfLines={2} style={[styles.title, { color: c.textPrimary, fontFamily: typography.display }]}>{comic.title}</Text>
          {onRate ? (
            <View style={styles.rateRow}>
              <Text style={[styles.rateLabel, { color: c.textSecondary, fontFamily: typography.body }]}>How was it?</Text>
              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`} accessibilityState={{ selected: stars >= n }} hitSlop={6} onPress={() => rate(n)}>
                    <Icon name={stars >= n ? 'star' : 'star-outline'} size={26} color={stars >= n ? c.textPrimary : c.textMuted} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).duration(360)} style={styles.next}>
          {next ? (
            <>
              <Text style={[styles.eyebrow, { color: c.textMuted, fontFamily: typography.bodySemibold }]}>UP NEXT</Text>
              <PressableScale to={0.97} onPress={() => onContinue(next)} accessibilityRole="button" accessibilityLabel={`Read ${next.title}`} style={[styles.cover, { backgroundColor: c.surfaceRaised, shadowColor: c.shadow }]}>
                {next.coverPath ? <Image source={{ uri: next.coverPath }} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} /> : null}
              </PressableScale>
              <Text numberOfLines={2} style={[styles.nextTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{next.title}</Text>
              <PressableScale to={0.97} onPress={() => onContinue(next)} accessibilityRole="button" style={[styles.primary, { backgroundColor: c.primary }]}>
                <Text style={[styles.primaryText, { color: c.primaryForeground, fontFamily: typography.bodySemibold }]}>{nextNo != null ? `Continue to #${nextNo}` : 'Read next'}</Text>
              </PressableScale>
            </>
          ) : (
            <Text style={[styles.none, { color: c.textSecondary, fontFamily: typography.body }]}>That’s the last one in this series on your shelf.</Text>
          )}
        </Animated.View>

        <View style={styles.footer}>
          <Pressable accessibilityRole="button" onPress={onShelf} hitSlop={8}><Text style={[styles.link, { color: c.textPrimary, fontFamily: typography.bodySemibold }]}>Back to shelf</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={onStay} hitSlop={8}><Text style={[styles.link, { color: c.textSecondary, fontFamily: typography.bodyMedium }]}>Stay on the last page</Text></Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 50 },
  body: { flex: 1, paddingHorizontal: space.xl, justifyContent: 'space-between' },
  head: { alignItems: 'center' },
  eyebrow: { fontSize: type.label, letterSpacing: 1.4, textAlign: 'center' },
  title: { fontSize: type.title, textAlign: 'center', marginTop: space.sm, letterSpacing: -0.4 },
  rateRow: { alignItems: 'center', marginTop: space.lg, gap: space.sm },
  rateLabel: { fontSize: type.callout },
  stars: { flexDirection: 'row', gap: space.md },
  next: { alignItems: 'center' },
  cover: { width: 150, height: 225, borderRadius: 14, overflow: 'hidden', marginTop: space.md, shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  nextTitle: { fontSize: type.subtitle, textAlign: 'center', marginTop: space.lg, maxWidth: 300 },
  primary: { marginTop: space.lg, minHeight: 52, borderRadius: 26, paddingHorizontal: space.xxl, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  primaryText: { fontSize: type.body },
  none: { fontSize: type.body, textAlign: 'center', maxWidth: 280 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { fontSize: type.callout },
});
