// A slowly drifting row of covers with a soft reflection beneath, used behind welcome and settings-style screens.
import { useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { ComicCover } from './comic';
import { useAppearance } from './theme';

export type FlowItem = { title: string; workId?: string };

export function CoverFlow({ items, height = 360 }: { items: FlowItem[]; height?: number }) {
  const { width, height: screenH } = useWindowDimensions(); const { theme } = useAppearance();
  const big = Math.min(width, screenH) >= 600; // tablets get bigger covers
  const cardW = Math.min(big ? 280 : 180, width * 0.44); const gap = 14; const step = cardW + gap;
  const row = useMemo(() => (items.length ? [...items, ...items, ...items] : []), [items]);
  const x = useSharedValue(0);
  useEffect(() => {
    if (!items.length) return;
    x.value = 0;
    x.value = withRepeat(withTiming(-step * items.length, { duration: items.length * 5200, easing: Easing.linear }), -1, false);
  }, [items.length, step, x]);
  const move = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const cards = row.map((it, i) => (
    <View key={`${it.workId ?? it.title}-${i}`} style={{ width: cardW, marginRight: gap }}><ComicCover size="fluid" title={it.title} workId={it.workId} /></View>
  ));
  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Animated.View style={[styles.row, { paddingLeft: (width - cardW) / 2 - step }, move]}>{cards}</Animated.View>
      {/* the reflection: the same row upside-down, faded out */}
      <View pointerEvents="none" style={[styles.mirrorWrap, { top: cardW * 1.5 + 8 }]}>
        <Animated.View style={[styles.row, { paddingLeft: (width - cardW) / 2 - step, transform: [{ scaleY: -1 }], opacity: 0.3 }, move]}>{cards}</Animated.View>
      </View>
      <LinearGradient pointerEvents="none" colors={['transparent', theme.colors.background]} locations={[0.35, 0.85]} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  mirrorWrap: { position: 'absolute', left: 0, right: 0, height: 140, overflow: 'hidden' },
});
