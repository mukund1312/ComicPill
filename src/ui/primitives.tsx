import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';
import { color, font, radius, space, type } from './tokens';
import { useAppearance } from './theme';

export function Wordmark({ small = false }: { small?: boolean }) {
  const { theme, typography } = useAppearance(); return <Text style={[styles.wordmark, { color: theme.colors.textPrimary, fontFamily: typography.display }, small && styles.wordmarkSmall]}>Comic<Text style={{ color: theme.colors.primary }}>Pill</Text></Text>;
}

export function Eyebrow({ children }: PropsWithChildren) {
  const { theme, typography } = useAppearance(); return <Text style={[styles.eyebrow, { color: theme.colors.textSecondary, fontFamily: typography.bodySemibold }]}>{children}</Text>;
}

export function Button({ children, onPress, kind = 'primary', disabled = false, style }: { children: ReactNode; onPress?: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'destructive'; disabled?: boolean; style?: ViewStyle }) {
  const { theme, typography } = useAppearance(); const c = theme.colors; const dynamic = kind === 'primary' ? { backgroundColor: c.primary, borderColor: c.primary } : kind === 'destructive' ? { backgroundColor: 'transparent', borderColor: c.destructive } : kind === 'secondary' ? { backgroundColor: c.surfaceRaised, borderColor: c.border } : { backgroundColor: 'transparent', borderColor: 'transparent' };
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, styles[`button_${kind}`], dynamic, disabled && styles.disabled, pressed && styles.pressed, style]}>
      <Text style={[styles.buttonText, { color: kind === 'primary' ? c.primaryForeground : c.textPrimary, fontFamily: typography.bodySemibold }]}>{children}</Text>
    </Pressable>
  );
}

export function Pill({ label, active = false, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const { theme, typography } = useAppearance(); const c = theme.colors; return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.pill, { backgroundColor: active ? c.primary : c.surfaceRaised, borderColor: active ? c.primary : c.border }, pressed && styles.pressed]}><Text style={[styles.pillText, { color: active ? c.primaryForeground : c.textSecondary, fontFamily: typography.bodyMedium }]}>{label}</Text></Pressable>;
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
  const { theme, typography } = useAppearance(); return <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: theme.colors.textPrimary, fontFamily: typography.displayMedium }]}>{title}</Text>{action ? <Pressable onPress={onAction}><Text style={[styles.sectionAction, { color: theme.colors.primary, fontFamily: typography.bodySemibold }]}>{action}</Text></Pressable> : null}</View>;
}

export function Progress({ value }: { value: number }) {
  const { theme } = useAppearance(); return <View style={[styles.progressTrack, { backgroundColor: theme.colors.border }]}><View style={[styles.progressFill, { backgroundColor: theme.colors.progress, width: `${Math.max(0, Math.min(1, value)) * 100}%` }]} /></View>;
}

export function Sheet({ title, children }: PropsWithChildren<{ title?: string }>) {
  const { theme, typography } = useAppearance(); return <View style={[styles.sheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><View style={[styles.handle, { backgroundColor: theme.colors.textMuted }]} />{title ? <Text style={[styles.sheetTitle, { color: theme.colors.textPrimary, fontFamily: typography.display }]}>{title}</Text> : null}{children}</View>;
}

export function Input({ placeholder, value, onChangeText, secureTextEntry = false }: { placeholder: string; value?: string; onChangeText?: (text: string) => void; secureTextEntry?: boolean }) {
  const { theme, typography } = useAppearance(); return <TextInput accessibilityLabel={placeholder} placeholder={placeholder} placeholderTextColor={theme.colors.textMuted} value={value} onChangeText={onChangeText} secureTextEntry={secureTextEntry} style={[styles.input, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceRaised, color: theme.colors.textPrimary, fontFamily: typography.body }]} />;
}

export function EmptyState({ mark = '◇', title, copy, action, onAction }: { mark?: string; title: string; copy: string; action?: string; onAction?: () => void }) {
  const { theme, typography } = useAppearance();
  return <View style={styles.empty}><Text style={[styles.emptyMark, { color: theme.colors.primary }]}>{mark}</Text><Text style={[styles.emptyTitle, { color: theme.colors.textPrimary, fontFamily: typography.display }]}>{title}</Text><Text style={[styles.emptyCopy, { color: theme.colors.textSecondary, fontFamily: typography.body }]}>{copy}</Text>{action ? <Button onPress={onAction} style={{ marginTop: space.lg }}>{action}</Button> : null}</View>;
}

const styles = StyleSheet.create({
  wordmark: { color: color.text, fontFamily: font.display, fontSize: 32, letterSpacing: -1.5 },
  wordmarkSmall: { fontSize: 24 },
  eyebrow: { color: color.muted, fontFamily: font.bodySemibold, fontSize: type.caption - 2, letterSpacing: 1.8, textTransform: 'uppercase' },
  button: { minHeight: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg, borderWidth: 1 },
  button_primary: { backgroundColor: color.accent, borderColor: color.accent },
  button_secondary: { backgroundColor: color.surface2, borderColor: color.border },
  button_ghost: { backgroundColor: 'transparent', borderColor: 'transparent', minHeight: 40 },
  button_destructive: { backgroundColor: 'transparent', borderColor: color.accent },
  buttonText: { color: color.text, fontSize: type.caption, fontFamily: font.bodySemibold },
  buttonTextSecondary: { color: color.text }, disabled: { opacity: 0.45 }, pressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  pill: { paddingHorizontal: 14, height: 34, borderRadius: radius.pill, backgroundColor: color.surface2, borderColor: color.border, borderWidth: 1, justifyContent: 'center' },
  pillActive: { backgroundColor: color.accent, borderColor: color.accent }, pillText: { color: color.muted, fontFamily: font.bodyMedium, fontSize: 12 }, pillTextActive: { color: color.text },
  badge: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: color.surface2, borderWidth: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: space.xxl, marginBottom: space.md },
  sectionTitle: { color: color.text, fontFamily: font.displayMedium, fontSize: type.title }, sectionAction: { color: color.accent, fontFamily: font.bodySemibold, fontSize: type.caption },
  progressTrack: { height: 6, backgroundColor: color.border, borderRadius: radius.pill, overflow: 'hidden' }, progressFill: { height: '100%', backgroundColor: color.accent, borderRadius: radius.pill },
  sheet: { backgroundColor: color.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: color.border, padding: space.lg, paddingBottom: space.xxl },
  handle: { width: 36, height: 4, alignSelf: 'center', borderRadius: radius.pill, backgroundColor: color.faint, marginBottom: space.lg }, sheetTitle: { color: color.text, fontFamily: font.display, fontSize: type.title, marginBottom: space.lg },
  input: { minHeight: 50, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, borderRadius: radius.md, color: color.text, fontFamily: font.body, paddingHorizontal: 14, fontSize: type.body },
  empty: { paddingVertical: 56, paddingHorizontal: 28, alignItems: 'center' }, emptyMark: { color: color.accent, fontSize: 36, marginBottom: 12 }, emptyTitle: { color: color.text, fontFamily: font.display, fontSize: type.title }, emptyCopy: { color: color.muted, fontFamily: font.body, fontSize: type.body, textAlign: 'center', lineHeight: 22, marginTop: 8 },
});
