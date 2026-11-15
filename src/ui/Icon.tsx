// One icon set for the whole app (Ionicons — outline for resting, filled for active), plus the round header button.
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from './PressableScale';
import { useAppearance } from './theme';
import { feedback } from '../lib/platform/feedback';

export type IconName = keyof typeof Ionicons.glyphMap;

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string; style?: unknown }) {
  const { theme } = useAppearance();
  return <Ionicons name={name} size={size} color={color ?? theme.colors.textPrimary} />;
}

/** The 40px round button that sits in a screen header (search, add, filter…). */
export function HeaderButton({ icon, label, onPress, active = false, disabled = false, showLabel = false }: { icon: IconName; label: string; onPress: () => void; active?: boolean; disabled?: boolean; /** Write the label next to the icon, for actions an icon alone doesn't explain. */ showLabel?: boolean }) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={label} disabled={disabled} hitSlop={8} to={0.9}
      onPress={() => { feedback.tap(); onPress(); }}
      style={[styles.headerButton, showLabel && styles.headerPill, { backgroundColor: active ? c.primaryMuted : c.surfaceRaised }]}>
      <Ionicons name={icon} size={showLabel ? 16 : 19} color={active ? c.primary : c.textPrimary} />
      {showLabel ? <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.headerLabel, { color: active ? c.primary : c.textPrimary, fontFamily: typography.bodySemibold }]}>{label}</Text> : null}
    </PressableScale>
  );
}

/** Several header buttons in a row. */
export function HeaderActions({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  headerButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerPill: { width: undefined, flexDirection: 'row', gap: 5, paddingHorizontal: 12 },
  headerLabel: { fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backWrap: { alignSelf: 'flex-start', marginBottom: 14 },
});

/** The one back control every full-page screen uses: the round chevron button, in the top-left corner. */
export function BackButton({ onPress, label = 'Back' }: { onPress: () => void; label?: string }) {
  return <View style={styles.backWrap}><HeaderButton icon="chevron-back" label={label} onPress={onPress} /></View>;
}
