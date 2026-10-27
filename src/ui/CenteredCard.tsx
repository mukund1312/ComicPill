// On a tablet a single-purpose screen (sign in, a setup step, settings) floats in the middle as a rounded card, the way an iPad shows a sheet,
// instead of hugging the top of a huge empty screen. On a phone it does nothing.
import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAppearance } from './theme';
import { useLayout } from './layout';

export function CenteredCard({ children, maxWidth = 680, fill = false }: PropsWithChildren<{ maxWidth?: number; fill?: boolean }>) {
  const { theme } = useAppearance(); const c = theme.colors;
  const { isTablet, height } = useLayout();
  if (!isTablet) return <>{children}</>;
  return (
    <View style={styles.stage}>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, maxWidth, maxHeight: Math.min(height - 72, 1000), shadowColor: '#000' }, fill && { flex: 1 }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', borderRadius: 36, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', shadowOpacity: 0.5, shadowRadius: 40, shadowOffset: { width: 0, height: 20 }, elevation: 20 },
});
