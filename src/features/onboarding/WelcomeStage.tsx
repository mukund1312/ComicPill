import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Button, Wordmark } from '../../ui/primitives';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { useReducedMotion } from '../../lib/platform/motion';

export function WelcomeStage({ onStart, onNewcomer, onSkipAll }: { onStart: () => void; onNewcomer: () => void; onSkipAll: () => void }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const reduced = useReducedMotion();
  const enter = (i: number) => (reduced ? undefined : FadeInDown.delay(i * 120).duration(320));
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
      <View style={styles.body}>
        <Animated.View entering={enter(0)}><Wordmark /></Animated.View>
        <Animated.Text entering={enter(1)} style={[styles.title, { color: c.textPrimary, fontFamily: typography.display }]}>Let’s find what you’ll love to read.</Animated.Text>
        <Animated.Text entering={enter(2)} style={[styles.copy, { color: c.textSecondary, fontFamily: typography.body }]}>
          A minute or two of taps: who you like, how you like it to look and feel. Then your comics, and a first pick. You can change all of it later.
        </Animated.Text>
      </View>
      <Animated.View entering={enter(3)} style={styles.footer}>
        <Button onPress={onStart}>Let’s begin</Button>
        <Button kind="secondary" onPress={onNewcomer}>I’m completely new to comics</Button>
        <Button kind="ghost" onPress={onSkipAll}>Skip setup for now</Button>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: space.lg },
  body: { flex: 1, justifyContent: 'center', gap: space.lg },
  title: { fontSize: 38, lineHeight: 44 },
  copy: { fontSize: 16, lineHeight: 24 },
  footer: { gap: 4 },
});
