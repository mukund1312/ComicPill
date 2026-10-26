// One icon set for the whole app (Ionicons — outline for resting, filled for active), plus the round header button.
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from './PressableScale';
import { useAppearance } from './theme';
import { feedback } from '../lib/platform/feedback';

export type IconName = keyof typeof Ionicons.glyphMap;

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const { theme } = useAppearance();
  return <Ionicons name={name} size={size} color={color ?? theme.colors.textPrimary} />;
}

/** The 40px round button that sits in a screen header (search, add, filter…). */
export function HeaderButton({ icon, label, onPress, active = false, disabled = false }: { icon: IconName; label: string; onPress: () => void; active?: boolean; disabled?: boolean }) {
  const { theme } = useAppearance(); const c = theme.colors;
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={label} disabled={disabled} hitSlop={6} to={0.9}
      onPress={() => { feedback.tap(); onPress(); }}
      style={[styles.headerButton, { backgroundColor: active ? c.primaryMuted : c.surfaceRaised }]}>
      <Ionicons name={icon} size={19} color={active ? c.primary : c.textPrimary} />
    </PressableScale>
  );
}

/** Several header buttons in a row. */
export function HeaderActions({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  headerButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
