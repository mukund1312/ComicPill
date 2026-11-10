import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

type Props = {
  /** Reading units in the order they sit in the pager (two pages each on a spread). */
  data: number[][];
  /** Index in `data` of the unit on screen now. */
  current: number;
  scrollX: SharedValue<number>;
  width: number;
  height: number;
  bg: string;
  /** Draws a unit full-size, without gestures (the same layout the pager uses). */
  render: (unit: number[]) => ReactNode;
};

/**
 * The open-book page turn for two-page spreads, drawn as its own layer over the pager. Like the curl, its progress is the pager's scroll
 * position, so a drag turns the page under the finger, letting go finishes or cancels, and an edge tap plays the whole turn. Going back is the
 * same turn run the other way.
 *
 * While unit k turns to unit k+1 the screen shows: k's left page (still lying flat), k+1's right page (uncovered underneath), and a sheet hinged on
 * the spine that carries k's right page on its front and k+1's left page on its back. The layer is opaque while a turn is under way, so whatever
 * the pager is doing beneath it never shows; at rest it is invisible and takes no touches.
 */
export function BookFlipLayer({ data, current, scrollX, width, height, bg, render }: Props) {
  // A turn forward from here, and a turn back from here, are both prepared.
  const turns = [current - 1, current].filter((k) => k >= 0 && k + 1 < data.length && data[k].length === 2 && data[k + 1].length === 2);
  return (
    <>
      {turns.map((k) => (
        <Turn key={k} k={k} from={data[k]} to={data[k + 1]} scrollX={scrollX} width={width} height={height} bg={bg} render={render} />
      ))}
    </>
  );
}

function Turn({ k, from, to, scrollX, width, height, bg, render }: { k: number; from: number[]; to: number[]; scrollX: SharedValue<number>; width: number; height: number; bg: string; render: (unit: number[]) => ReactNode }) {
  const half = width / 2;
  const progress = (x: number) => { 'worklet'; const t = x / width - k; return t > 0.001 && t < 0.999 ? t : 0; };

  const layer = useAnimatedStyle(() => ({ opacity: progress(scrollX.value) > 0 ? 1 : 0 }));
  const sheet = useAnimatedStyle(() => ({ transform: [{ perspective: 2000 }, { rotateY: `${-180 * progress(scrollX.value)}deg` }] }));
  // The turning page darkens as it rises off the paper, and its back brightens as it settles onto the left.
  const frontShade = useAnimatedStyle(() => ({ opacity: interpolate(progress(scrollX.value), [0, 0.5], [0, 0.5], Extrapolation.CLAMP) }));
  const backShade = useAnimatedStyle(() => ({ opacity: interpolate(progress(scrollX.value), [0.5, 1], [0.5, 0], Extrapolation.CLAMP) }));
  // Shadow the sheet casts on the page it is uncovering (right side, first half) and on the page it lands on (left side, second half).
  const rightShadow = useAnimatedStyle(() => { const t = progress(scrollX.value); return { opacity: t > 0 && t < 0.5 ? Math.sin(Math.PI * t) * 0.7 : 0 }; });
  const leftShadow = useAnimatedStyle(() => { const t = progress(scrollX.value); return { opacity: t >= 0.5 ? Math.sin(Math.PI * t) * 0.7 : 0 }; });

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: bg }, layer]}>
      <Half side="left" width={width} height={height} node={render(from)} />
      <View style={[styles.right, { left: half, width: half, height }]}><Half side="right" width={width} height={height} node={render(to)} /></View>
      <Animated.View style={[styles.castRight, { left: half, height }, rightShadow]}>
        <LinearGradient colors={['#000000aa', '#00000000']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[styles.castLeft, { left: half - 60, height }, leftShadow]}>
        <LinearGradient colors={['#00000000', '#000000aa']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[styles.sheet, { left: half, width: half, height }, sheet]}>
        <View style={styles.face}>
          <Half side="right" width={width} height={height} node={render(from)} />
          <Animated.View style={[StyleSheet.absoluteFill, styles.shade, frontShade]} />
        </View>
        <View style={[styles.face, styles.back]}>
          <Half side="left" width={width} height={height} node={render(to)} />
          <Animated.View style={[StyleSheet.absoluteFill, styles.shade, backShade]} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

/** One page of a spread: the left or right half of a full-width copy of the unit. */
function Half({ node, width, height, side }: { node: ReactNode; width: number; height: number; side: 'left' | 'right' }) {
  return (
    <View style={{ width: width / 2, height, overflow: 'hidden' }}>
      <View style={{ width, height, marginLeft: side === 'right' ? -width / 2 : 0 }}>{node}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  right: { position: 'absolute', top: 0 },
  sheet: { position: 'absolute', top: 0, transformOrigin: 'left center' },
  face: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backfaceVisibility: 'hidden', overflow: 'hidden' },
  back: { transform: [{ rotateY: '180deg' }] },
  shade: { backgroundColor: '#000' },
  castRight: { position: 'absolute', top: 0, width: 60 },
  castLeft: { position: 'absolute', top: 0, width: 60 },
});
