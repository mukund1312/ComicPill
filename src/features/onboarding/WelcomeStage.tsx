import { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Button, Wordmark } from '../../ui/primitives';
import { CoverFlow, type FlowItem } from '../../ui/CoverFlow';
import { COVER_ASSETS } from '../../ui/coverAssets';
import { sqlite } from '../../lib/db/client';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { useReducedMotion } from '../../lib/platform/motion';

/** A handful of catalog books that have real cover art, for the drifting reel. */
function reelItems(): FlowItem[] {
  try {
    const ids = Object.keys(COVER_ASSETS);
    const step = Math.max(1, Math.floor(ids.length / 12));
    const pick = new Set(Array.from({ length: 12 }, (_, i) => ids[(i * step) % ids.length]));
    return sqlite.getAllSync<{ id: string; title: string }>(`SELECT id, title FROM works WHERE id IN (${[...pick].map(() => '?').join(',')})`, ...pick).map((w) => ({ title: w.title, workId: w.id }));
  } catch { return []; }
}

export function WelcomeStage({ onStart, onNewcomer, onSkipAll }: { onStart: () => void; onNewcomer: () => void; onSkipAll: () => void }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const reduced = useReducedMotion();
  const { width: sw, height: sh } = useWindowDimensions(); const tablet = Math.min(sw, sh) >= 600; const reelH = Math.round(sh * 0.52); // the ribbon fills about half the screen on a tablet
  const items = useMemo(() => reelItems(), []);
  const enter = (i: number) => (reduced ? undefined : FadeInDown.delay(i * 120).duration(360));
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
      <View style={styles.reel}>{items.length ? <CoverFlow items={items} height={tablet ? reelH : 400} cardWidth={tablet ? Math.min((reelH - 90) / 1.5, sw * 0.3) : undefined} /> : null}</View>
      <View style={styles.body}>
        <Animated.View entering={enter(0)} style={{ alignItems: 'center' }}><Wordmark /></Animated.View>
        <Animated.Text entering={enter(1)} style={[styles.title, { color: c.textPrimary, fontFamily: typography.display }]}>Your comics, beautifully organised.</Animated.Text>
        <Animated.Text entering={enter(2)} style={[styles.copy, { color: c.textSecondary, fontFamily: typography.body }]}>
          Read every format, discover what to read next, and let a minute of taps tune the picks to you.
        </Animated.Text>
      </View>
      <Animated.View entering={enter(3)} style={styles.footer}>
        <Button onPress={onStart}>Get started</Button>
        <Button kind="secondary" onPress={onNewcomer}>I’m completely new to comics</Button>
        <Button kind="ghost" onPress={onSkipAll}>Skip setup for now</Button>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: space.lg },
  reel: { marginHorizontal: -space.lg, marginTop: 6 },
  body: { flex: 1, justifyContent: 'center', gap: 10, marginTop: -40, width: '100%', maxWidth: 560, alignSelf: 'center' },
  title: { fontSize: 32, lineHeight: 37, letterSpacing: -0.8, textAlign: 'center' },
  copy: { fontSize: 15.5, lineHeight: 23, textAlign: 'center' },
  footer: { gap: 4, width: '100%', maxWidth: 560, alignSelf: 'center' },
});
