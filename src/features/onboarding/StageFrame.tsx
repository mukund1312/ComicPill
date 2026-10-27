// The shell every onboarding step shares: quiet progress dots, a back control,
// the heading, a scrolling body and one footer with the primary action.
// "Skip" is always offered on a picking step so nobody is ever trapped.
import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../ui/primitives';
import { CenteredCard } from '../../ui/CenteredCard';
import { useLayout } from '../../ui/layout';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';

export function ProgressDots({ index, total }: { index: number; total: number }) {
  const { theme } = useAppearance();
  const c = theme.colors;
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={`Step ${index + 1} of ${total}`} style={styles.dots}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.dot, { width: i === index ? 18 : 6, backgroundColor: i <= index ? c.primary : c.border }]} />
      ))}
    </View>
  );
}

export function StageFrame({ title, subtitle, progress, onBack, primaryLabel, onPrimary, primaryDisabled, onSkip, skipLabel = 'Skip', hint, children, footerExtra, picksPanel }: PropsWithChildren<{
  title: string; subtitle?: string; progress?: { index: number; total: number } | null; onBack?: (() => void) | null;
  primaryLabel?: string; onPrimary?: () => void; primaryDisabled?: boolean; onSkip?: () => void; skipLabel?: string; hint?: string; footerExtra?: ReactNode;
  /** On a landscape tablet: a left column of what you've picked, with the choices on the right. */
  picksPanel?: ReactNode;
}>) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const { isTablet, isLandscape } = useLayout();
  const split = isTablet && isLandscape && !!picksPanel;
  const heading = (
    <>
      <Text accessibilityRole="header" style={[styles.title, { color: c.textPrimary, fontFamily: typography.display }, split && { fontSize: 38, lineHeight: 44 }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: c.textSecondary, fontFamily: typography.body }]}>{subtitle}</Text> : null}
    </>
  );
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
      <CenteredCard fill maxWidth={split ? 1180 : 720}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.top}>
          {onBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} onPress={onBack} style={styles.back}><Text style={[styles.backText, { color: c.textSecondary }]}>‹</Text></Pressable>
          ) : <View style={styles.back} />}
          {progress ? <ProgressDots index={progress.index} total={progress.total} /> : <View />}
          <View style={styles.back} />
        </View>
        {split ? (
          <View style={styles.splitRow}>
            <View style={[styles.splitLeft, { borderRightColor: c.border }]}>{heading}<View style={styles.splitPicks}>{picksPanel}</View></View>
            <ScrollView style={styles.splitRight} contentContainerStyle={styles.splitRightContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>{children}</ScrollView>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
            {heading}
            <View style={styles.body}>{children}</View>
          </ScrollView>
        )}
        {onPrimary || onSkip ? (
          <View style={[styles.footer, { backgroundColor: c.background, borderTopColor: c.border }]}>
            {hint ? <Text style={[styles.hint, { color: c.textMuted, fontFamily: typography.body }]}>{hint}</Text> : null}
            {footerExtra}
            {onPrimary ? <Button onPress={onPrimary} disabled={primaryDisabled}>{primaryLabel ?? 'Continue'}</Button> : null}
            {onSkip ? <Button kind="ghost" onPress={onSkip}>{skipLabel}</Button> : null}
          </View>
        ) : null}
      </KeyboardAvoidingView>
      </CenteredCard>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  splitRow: { flex: 1, flexDirection: 'row' },
  splitLeft: { width: '38%', paddingHorizontal: space.xl, paddingTop: 8, paddingBottom: space.lg, borderRightWidth: StyleSheet.hairlineWidth },
  splitPicks: { flex: 1, minHeight: 0, marginTop: space.lg },
  splitRight: { flex: 1 },
  splitRightContent: { padding: space.xl, paddingTop: 8 },
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, minHeight: 44 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 32, lineHeight: 34 },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { height: 6, borderRadius: 3 },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  title: { fontSize: 30, lineHeight: 36, marginTop: 4 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 6 },
  body: { marginTop: space.lg },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm, borderTopWidth: StyleSheet.hairlineWidth, gap: 4 },
  hint: { fontSize: 12, textAlign: 'center', marginBottom: 4 },
});
