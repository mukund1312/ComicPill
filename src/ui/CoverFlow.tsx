// A slowly drifting row of covers with a soft reflection beneath, used behind welcome and settings-style screens.
import { useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { ComicCover } from './comic';
import { useAppearance } from './theme';

export type FlowItem = { title: string; workId?: string };

export function CoverFlow({ items, height = 360, cardWidth }: { items: FlowItem[]; height?: number; cardWidth?: number }) {
  const { width, height: screenH } = useWindowDimensions(); const { theme } = useAppearance();
  const big = Math.min(width, screenH) >= 600; // tablets get bigger covers
  const cardW = cardWidth ?? Math.min(big ? 280 : 180, width * 0.44); const gap = 26; const step = cardW + gap;
  const row = useMemo(() => (items.length ? [...items, ...items, ...items] : []), [items]);
  const x = useSharedValue(0);
  useEffect(() => {
    if (!items.length) return;
    x.value = 0;
    x.value = withRepeat(withTiming(-step * items.length, { duration: items.length * 5200, easing: Easing.linear }), -1, false);
  }, [items.length, step, x]);
  const move = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const cards = row.map((it, i) => (
    <View key={`${it.workId ?? it.title}-${i}`} style={{ width: cardW, marginRight: gap }}>
      {/* a soft shadow built from stacked translucent layers (Android's own shadow would draw above the fade) */}
      {[34, 29, 24, 19, 14, 9, 5, 2].map((grow, k) => <View key={grow} pointerEvents="none" style={{ position: 'absolute', left: -grow, right: -grow, top: -grow + 16, bottom: -grow - 16, borderRadius: 14 + grow, backgroundColor: '#000', opacity: 0.06 + k * 0.014 }} />)}
      <ComicCover size="fluid" title={it.title} workId={it.workId} />
    </View>
  ));
  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Animated.View style={[styles.row, { paddingTop: 28, paddingLeft: (width - cardW) / 2 - step }, move]}>{cards}</Animated.View>
      {/* the ribbon melts into the page over its lower half: no edge, nothing to cut off */}
      <LinearGradient pointerEvents="none" colors={[`${theme.colors.background}00`, `${theme.colors.background}00`, `${theme.colors.background}55`, `${theme.colors.background}CC`, theme.colors.background]} locations={[0, 0.34, 0.52, 0.68, 0.78]} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
});
