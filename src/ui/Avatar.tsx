import { Image, StyleSheet, Text, View } from 'react-native';
import { useAppearance } from './theme';

/** The reader's photo if they set one, otherwise their initial. */
export function Avatar({ uri, initial, size = 92 }: { uri: string | null; initial: string; size?: number }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={uri ? 'Profile photo' : `Profile picture, initial ${initial}`}
      style={[styles.ring, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.primaryMuted, borderColor: c.primary, borderWidth: size > 60 ? 3 : 1 }]}
    >
      {uri
        ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        : <Text style={{ color: c.textPrimary, fontFamily: typography.display, fontSize: size * 0.44 }}>{initial}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({ ring: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } });
