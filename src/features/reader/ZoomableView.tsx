import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withDecay, withTiming } from 'react-native-reanimated';
import { color } from '../../ui/tokens';

type Props = {
  width: number;
  height: number;
  /** Size of the visible content inside the view (after fit); pan bounds follow it. Defaults to the view. */
  contentWidth?: number;
  contentHeight?: number;
  /** x is the tap position within the view, 0..width */
  onTap: (x: number) => void;
  children: ReactNode;
};

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const EDGE_SLACK = 2;

/**
 * Pinch (about the fingers), double-tap (about the tap), and pan with momentum. At 1× — or when
 * pushed against an edge — pan steps aside so the pager can swipe to the next page.
 */
export function ZoomableView({ width, height, contentWidth = width, contentHeight = height, onTap, children }: Props) {
  const scale = useSharedValue(1); const tx = useSharedValue(0); const ty = useSharedValue(0);
  const s0 = useSharedValue(1); const x0 = useSharedValue(0); const y0 = useSharedValue(0);
  const lastTouchX = useSharedValue(0); const panning = useSharedValue(false);

  const maxX = (s: number) => { 'worklet'; return Math.max(0, (contentWidth * s - width) / 2); };
  const maxY = (s: number) => { 'worklet'; return Math.max(0, (contentHeight * s - height) / 2); };
  const clamp = (v: number, limit: number) => { 'worklet'; return Math.min(limit, Math.max(-limit, v)); };

  const pinch = Gesture.Pinch()
    .onStart(() => { s0.value = scale.value; x0.value = tx.value; y0.value = ty.value; })
    .onUpdate((e) => {
      const s = Math.min(MAX_SCALE, Math.max(1, s0.value * e.scale)); const k = s / s0.value;
      const cx = e.focalX - width / 2; const cy = e.focalY - height / 2;
      scale.value = s;
      tx.value = clamp(cx - (cx - x0.value) * k, maxX(s));
      ty.value = clamp(cy - (cy - y0.value) * k, maxY(s));
    })
    .onEnd(() => {
      if (scale.value < 1.05) { scale.value = withTiming(1); tx.value = withTiming(0); ty.value = withTiming(0); }
    });

  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((e) => { lastTouchX.value = e.allTouches[0]?.x ?? 0; })
    .onTouchesMove((e, manager) => {
      if (panning.value) return;
      if (scale.value <= 1.01) { manager.fail(); return; }
      const x = e.allTouches[0]?.x ?? 0; const dx = x - lastTouchX.value; lastTouchX.value = x;
      if (e.numberOfTouches === 1 && Math.abs(dx) > EDGE_SLACK) {
        const limit = maxX(scale.value);
        // Pushing past an edge hands the swipe to the pager (next/previous page).
        if ((dx > 0 && tx.value >= limit - EDGE_SLACK) || (dx < 0 && tx.value <= -limit + EDGE_SLACK)) { manager.fail(); return; }
      }
      manager.activate();
    })
    .onStart(() => { panning.value = true; x0.value = tx.value; y0.value = ty.value; })
    .onUpdate((e) => {
      tx.value = clamp(x0.value + e.translationX, maxX(scale.value));
      ty.value = clamp(y0.value + e.translationY, maxY(scale.value));
    })
    .onEnd((e) => {
      tx.value = withDecay({ velocity: e.velocityX, clamp: [-maxX(scale.value), maxX(scale.value)] });
      ty.value = withDecay({ velocity: e.velocityY, clamp: [-maxY(scale.value), maxY(scale.value)] });
    })
    .onFinalize(() => { panning.value = false; });

  const doubleTap = Gesture.Tap().numberOfTaps(2).maxDuration(250).onEnd((e) => {
    if (scale.value > 1.01) { scale.value = withTiming(1); tx.value = withTiming(0); ty.value = withTiming(0); return; }
    const cx = e.x - width / 2; const cy = e.y - height / 2;
    scale.value = withTiming(DOUBLE_TAP_SCALE);
    tx.value = withTiming(clamp(-(DOUBLE_TAP_SCALE - 1) * cx, maxX(DOUBLE_TAP_SCALE)));
    ty.value = withTiming(clamp(-(DOUBLE_TAP_SCALE - 1) * cy, maxY(DOUBLE_TAP_SCALE)));
  });
  const singleTap = Gesture.Tap().runOnJS(true).maxDuration(250).onEnd((e) => onTap(e.x));

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={Gesture.Race(Gesture.Exclusive(doubleTap, singleTap), Gesture.Simultaneous(pinch, pan))}>
      <View style={[styles.page, { width, height }]}>
        <Animated.View style={[styles.center, style]}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: color.bg, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
