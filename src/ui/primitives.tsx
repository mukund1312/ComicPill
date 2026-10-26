import type { PropsWithChildren, ReactNode } from 'react';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSheetDrag } from './sheetDrag';
import { Pressable, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';
import { PressableScale } from './PressableScale';
import { Icon } from './Icon';
import { color, font, radius, space, type } from './tokens';
import { useAppearance } from './theme';
import { feedback } from '../lib/platform/feedback';

export function Wordmark({ small = false }: { small?: boolean }) {
  const { theme, typography } = useAppearance(); return <Text style={[styles.wordmark, { color: theme.colors.textPrimary, fontFamily: typography.display }, small && styles.wordmarkSmall]}>Comic<Text style={{ color: theme.colors.primary }}>Pill</Text></Text>;
}

export function Eyebrow({ children }: PropsWithChildren) {
  const { theme, typography } = useAppearance(); return <Text style={[styles.eyebrow, { color: theme.colors.textSecondary, fontFamily: typography.bodySemibold }]}>{children}</Text>;
}

export function Button({ children, onPress, kind = 'primary', disabled = false, style }: { children: ReactNode; onPress?: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'destructive'; disabled?: boolean; style?: ViewStyle }) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const bg = kind === 'primary' ? c.secondary : kind === 'secondary' ? c.surfaceRaised : kind === 'destructive' ? `${c.destructive}22` : 'transparent';
  const fg = kind === 'primary' ? c.secondaryForeground : kind === 'destructive' ? c.destructive : c.textPrimary;
  return (
    <PressableScale accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} to={0.97} onPress={() => { feedback.tap(); onPress?.(); }}
      style={[styles.button, kind === 'ghost' && styles.buttonGhost, { backgroundColor: bg }, disabled && styles.disabled, style]}>
      <Text style={[styles.buttonText, { color: fg, fontFamily: typography.bodySemibold }]}>{children}</Text>
    </PressableScale>
  );
}

export function Pill({ label, active = false, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  return (
    <PressableScale accessibilityRole="button" accessibilityState={{ selected: active }} to={0.94} onPress={() => { feedback.select(); onPress?.(); }}
      style={[styles.pill, { backgroundColor: active ? c.primary : c.surfaceRaised }]}>
      <Text style={[styles.pillText, { color: active ? c.primaryForeground : c.textSecondary, fontFamily: typography.bodySemibold }]}>{label}</Text>
    </PressableScale>
  );
}

export function PurchaseBadge({ label }: { label: 'collect' | 'buy_on_sale' | 'digital_is_fine' | 'try_digital_first' | 'skip' }) {
  const meta = {
    collect: ['♛', 'Collect', color.collectGold], buy_on_sale: ['◈', 'Buy on sale', color.warning],
    digital_is_fine: ['▣', 'Digital is fine', color.digital], try_digital_first: ['◐', 'Try digital first', color.tryDigital], skip: ['⊘', 'Skip', color.faint],
  } as const;
  const [icon, text, tint] = meta[label];
  return <View style={[styles.badge, { borderColor: tint + '66' }]}><Text style={{ color: tint }}>{icon} {text}</Text></View>;
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { theme, typography } = useAppearance();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary, fontFamily: typography.displayMedium }]}>{title}</Text>
      {action ? <PressableScale to={0.94} onPress={onAction} hitSlop={8}><Text style={[styles.sectionAction, { color: theme.colors.primary, fontFamily: typography.bodySemibold }]}>{action} ›</Text></PressableScale> : null}
    </View>
  );
}

export function Progress({ value }: { value: number }) {
  const { theme } = useAppearance(); return <View style={[styles.progressTrack, { backgroundColor: theme.colors.border }]}><View style={[styles.progressFill, { backgroundColor: theme.colors.progress, width: `${Math.max(0, Math.min(1, value)) * 100}%` }]} /></View>;
}

/** A bottom sheet. With `onClose` it also closes when you tap outside it or drag it down. */
export function Sheet({ title, children, onClose }: PropsWithChildren<{ title?: string; onClose?: () => void }>) {
  const { theme, typography } = useAppearance();
  const drag = useSheetDrag(onClose);
  return (
    <>
      {onClose ? <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} /> : null}
      <GestureDetector gesture={drag.gesture}>
        <Animated.View style={[styles.sheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, drag.style]}>
          <View style={[styles.handle, { backgroundColor: theme.colors.textMuted }]} />
          {title ? <Text style={[styles.sheetTitle, { color: theme.colors.textPrimary, fontFamily: typography.display }]}>{title}</Text> : null}
          {children}
        </Animated.View>
      </GestureDetector>
    </>
  );
}

export function Input({ placeholder, value, onChangeText, secureTextEntry = false }: { placeholder: string; value?: string; onChangeText?: (text: string) => void; secureTextEntry?: boolean }) {
  const { theme, typography } = useAppearance(); return <TextInput accessibilityLabel={placeholder} placeholder={placeholder} placeholderTextColor={theme.colors.textMuted} value={value} onChangeText={onChangeText} secureTextEntry={secureTextEntry} style={[styles.input, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceRaised, color: theme.colors.textPrimary, fontFamily: typography.body }]} />;
}

export function EmptyState({ title, copy, action, onAction }: { mark?: string; title: string; copy: string; action?: string; onAction?: () => void }) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: c.primaryMuted }]}><Icon name="sparkles-outline" size={28} color={c.primary} /></View>
      <Text style={[styles.emptyTitle, { color: c.textPrimary, fontFamily: typography.display }]}>{title}</Text>
      <Text style={[styles.emptyCopy, { color: c.textSecondary, fontFamily: typography.body }]}>{copy}</Text>
      {action ? <View style={{ marginTop: space.lg, alignSelf: 'stretch' }}><Button onPress={onAction}>{action}</Button></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wordmark: { color: color.text, fontFamily: font.display, fontSize: 32, letterSpacing: -1.2 },
  wordmarkSmall: { fontSize: 24 },
  eyebrow: { color: color.muted, fontFamily: font.bodySemibold, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase' },
  button: { minHeight: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  buttonGhost: { minHeight: 44 },
  buttonText: { fontSize: 16, letterSpacing: -0.1 },
  disabled: { opacity: 0.4 },
  pill: { paddingHorizontal: 16, height: 38, borderRadius: radius.pill, justifyContent: 'center' },
  pillText: { fontSize: 13.5 },
  badge: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: color.surface2, borderWidth: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: space.xxl, marginBottom: space.md },
  sectionTitle: { fontSize: 22, letterSpacing: -0.4 },
  sectionAction: { fontSize: 14 },
  progressTrack: { height: 4, borderRadius: radius.pill, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill },
  sheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0, padding: space.lg, paddingBottom: space.xxl, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 30, shadowOffset: { width: 0, height: -10 }, elevation: 24 },
  handle: { width: 40, height: 5, alignSelf: 'center', borderRadius: radius.pill, marginBottom: space.lg, opacity: 0.5 },
  sheetTitle: { fontSize: 26, letterSpacing: -0.5, marginBottom: space.lg },
  input: { minHeight: 54, borderRadius: 16, paddingHorizontal: 16, fontSize: 16, borderWidth: StyleSheet.hairlineWidth },
  empty: { paddingVertical: 56, paddingHorizontal: 28, alignItems: 'center' },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle: { fontSize: 24, letterSpacing: -0.4, textAlign: 'center' },
  emptyCopy: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginTop: 8 },
});
