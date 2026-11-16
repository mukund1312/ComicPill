import { useEffect } from 'react';
import { motion } from '../../ui/motion';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { useAppearance } from '../../ui/theme';

export const STACK_W = 84;
export const STACK_H = 126;

// How each card sits once the stack has formed: the one on top is straight, those behind lean out a little, like a handful of cards.
const FAN = [{ rot: 0, dx: 0, dy: 0 }, { rot: -8, dx: -7, dy: 5 }, { rot: 7, dx: 8, dy: 9 }, { rot: -3, dx: 3, dy: 13 }];
// Where cards start, so they appear to gather in from the sides as the drag begins.
const GATHER = [{ x: 0, y: 0 }, { x: -90, y: 30 }, { x: 90, y: 40 }, { x: 0, y: 80 }];

type LayerProps = { k: number; uri: string | null; title: string; x: SharedValue<number>; y: SharedValue<number>; appear: SharedValue<number>; count: number };

function Layer({ k, uri, title, x, y, appear, count }: LayerProps) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  // The top card follows the finger closely; each card behind it trails a little further, so the pile feels loose and alive.
  const cfg = { damping: 15 + k * 3, stiffness: k === 0 ? 900 : 260 - k * 55, mass: 0.5 };
  const px = useDerivedValue(() => withSpring(x.value, cfg));
  const py = useDerivedValue(() => withSpring(y.value, cfg));
  const style = useAnimatedStyle(() => {
    const t = appear.value; const g = GATHER[k]; const f = FAN[k];
    return {
      opacity: Math.min(1, t * 3),
      transform: [
        { translateX: px.value + f.dx * t + g.x * (1 - t) },
        { translateY: py.value + f.dy * t + g.y * (1 - t) },
        { rotate: `${f.rot * t}deg` },
        { scale: 0.85 + 0.2 * t }, // lifted: a little bigger than it was on the shelf
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.card, { backgroundColor: c.surfaceRaised, borderColor: c.border }, style]}>
      {uri ? <Image transition={180} source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <View style={[StyleSheet.absoluteFill, styles.blank]}><Text numberOfLines={4} style={styles.blankText}>{title}</Text></View>}
      {k === 0 && count > 1 ? <View style={[styles.badge, { backgroundColor: c.primary }]}><Text style={[styles.badgeText, { color: c.primaryForeground, fontFamily: typography.bodySemibold }]}>{count}</Text></View> : null}
    </Animated.View>
  );
}

/** The selected comics gathered into one pile under the finger while you drag them. `x`/`y` are the top-left of the pile. */
export function DragStack({ covers, count, x, y }: { covers: { uri: string | null; title: string }[]; count: number; x: SharedValue<number>; y: SharedValue<number> }) {
  const appear = useSharedValue(0);
  useEffect(() => { appear.set(withSpring(1, motion.snap)); }, [appear]);
  const shown = covers.slice(0, FAN.length);
  return <>{shown.map((cover, k) => ({ cover, k })).reverse().map(({ cover, k }) => <Layer key={k} k={k} uri={cover.uri} title={cover.title} x={x} y={y} appear={appear} count={count} />)}</>;
}

const styles = StyleSheet.create({
  card: { position: 'absolute', left: 0, top: 0, width: STACK_W, height: STACK_H, borderRadius: 12, borderWidth: 1, overflow: 'visible', shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  blank: { alignItems: 'center', justifyContent: 'center', padding: 8, backgroundColor: '#2A2F3A', borderRadius: 11 },
  blankText: { color: '#E8E8EC', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  badge: { position: 'absolute', top: -10, right: -10, minWidth: 26, height: 26, paddingHorizontal: 6, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 14 },
});
