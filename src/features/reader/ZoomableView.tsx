import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withDecay, withTiming } from 'react-native-reanimated';
import { color } from '../../ui/tokens';
import type { Panel } from '../../lib/reader/guided/panels';

export type ZoomHandle = {
  /** Animate to fill the view with a panel (normalised to the content); null returns to the full page. */
  zoomToPanel(panel: Panel | null): void;
};

type Props = {
  width: number;
  height: number;
  /** Size of the visible content inside the view (after fit); pan bounds follow it. Defaults to the view. */
  contentWidth?: number;
  contentHeight?: number;
  /** x is the tap position within the view, 0..width */
  onTap: (x: number) => void;
  background?: string;
  children: ReactNode;
};

const MAX_SCALE = 6;
const DOUBLE_TAP_SCALE = 2.5;
const EDGE_SLACK = 2;
/** Finger travel before pan decides between moving the picture and handing off to the pager. */
const DECIDE_AFTER = 8;
/** A second touch this soon after the first lift, and this close, starts a one-finger zoom. */
const ONE_FINGER_WINDOW_MS = 300;
const ONE_FINGER_RADIUS = 48;
/** Pixels of drag per doubling when zooming with one finger. */
const ONE_FINGER_PER_DOUBLING = 140;

/**
 * Pinch (about the fingers), double-tap (about the tap), and pan with momentum. At 1× — or when
 * pushed against an edge — pan steps aside so the pager can swipe to the next page.
 */
export const ZoomableView = forwardRef<ZoomHandle, Props>(function ZoomableView({ width, height, contentWidth = width, contentHeight = height, onTap, background = color.bg, children }, ref) {
  // A fit-width page can be taller than the screen: it scrolls vertically even at 1×.
  const tallPage = contentHeight > height + 1;
  // Tall pages start at the top, not the middle. (A rotation re-mounts the list, so this runs again.)
  const scale = useSharedValue(1); const tx = useSharedValue(0); const ty = useSharedValue(tallPage ? (contentHeight - height) / 2 : 0);
  const s0 = useSharedValue(1); const x0 = useSharedValue(0); const y0 = useSharedValue(0);
  const startTouchX = useSharedValue(0); const startTouchY = useSharedValue(0);
  const lastUpAt = useSharedValue(0); const lastUpX = useSharedValue(0); const lastUpY = useSharedValue(0);
  const oneFinger = useSharedValue(false); const panning = useSharedValue(false);

  const maxX = (s: number) => { 'worklet'; return Math.max(0, (contentWidth * s - width) / 2); };
  const maxY = (s: number) => { 'worklet'; return Math.max(0, (contentHeight * s - height) / 2); };
  const clamp = (v: number, limit: number) => { 'worklet'; return Math.min(limit, Math.max(-limit, v)); };

  useImperativeHandle(ref, () => ({
    zoomToPanel(panel) {
      if (!panel) { scale.value = withTiming(1); tx.value = withTiming(0); ty.value = withTiming(0); return; }
      // Panel centre relative to the content centre, then scaled so the panel fills ~96% of the view.
      const cx = (panel.x + panel.w / 2 - 0.5) * contentWidth; const cy = (panel.y + panel.h / 2 - 0.5) * contentHeight;
      const s = Math.min(MAX_SCALE, Math.max(1, Math.min((width * 0.96) / (panel.w * contentWidth), (height * 0.96) / (panel.h * contentHeight))));
      const limitX = Math.max(0, (contentWidth * s - width) / 2); const limitY = Math.max(0, (contentHeight * s - height) / 2);
      scale.value = withTiming(s, { duration: 280 });
      tx.value = withTiming(Math.min(limitX, Math.max(-limitX, -cx * s)), { duration: 280 });
      ty.value = withTiming(Math.min(limitY, Math.max(-limitY, -cy * s)), { duration: 280 });
    },
  }), [width, height, contentWidth, contentHeight, scale, tx, ty]);

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
    .onTouchesDown((e) => {
      const x = e.allTouches[0]?.x ?? 0; const y = e.allTouches[0]?.y ?? 0;
      startTouchX.value = x; startTouchY.value = y;
      // Double-tap, then keep the finger down and drag: Maps-style zoom you can do with a thumb.
      oneFinger.value = e.numberOfTouches === 1 && Date.now() - lastUpAt.value < ONE_FINGER_WINDOW_MS && Math.abs(x - lastUpX.value) < ONE_FINGER_RADIUS && Math.abs(y - lastUpY.value) < ONE_FINGER_RADIUS;
    })
    .onTouchesUp((e) => { lastUpAt.value = Date.now(); lastUpX.value = e.changedTouches[0]?.x ?? 0; lastUpY.value = e.changedTouches[0]?.y ?? 0; })
    .onTouchesMove((e, manager) => {
      if (panning.value) return;
      if (oneFinger.value) {
        if (Math.abs((e.allTouches[0]?.y ?? 0) - startTouchY.value) >= DECIDE_AFTER) manager.activate();
        return;
      }
      if (scale.value <= 1.01 && !tallPage) { manager.fail(); return; }
      const dx = (e.allTouches[0]?.x ?? 0) - startTouchX.value;
      const dy = (e.allTouches[0]?.y ?? 0) - startTouchY.value;
      if (e.numberOfTouches === 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < DECIDE_AFTER) return; // not enough movement to know where the finger is heading
        if (Math.abs(dx) >= Math.abs(dy)) {
          const limit = maxX(scale.value);
          // Pushing past a horizontal edge hands the swipe to the pager (next/previous page).
          if ((dx > 0 && tx.value >= limit - EDGE_SLACK) || (dx < 0 && tx.value <= -limit + EDGE_SLACK)) { manager.fail(); return; }
        }
      }
      manager.activate();
    })
    .onStart(() => { panning.value = true; x0.value = tx.value; y0.value = ty.value; s0.value = scale.value; })
    .onUpdate((e) => {
      if (oneFinger.value) {
        // Drag down to zoom in, up to zoom out, about the point that was held.
        const s = Math.min(MAX_SCALE, Math.max(1, s0.value * Math.pow(2, e.translationY / ONE_FINGER_PER_DOUBLING))); const k = s / s0.value;
        const cx = startTouchX.value - width / 2; const cy = startTouchY.value - height / 2;
        scale.value = s; tx.value = clamp(cx - (cx - x0.value) * k, maxX(s)); ty.value = clamp(cy - (cy - y0.value) * k, maxY(s));
        return;
      }
      tx.value = clamp(x0.value + e.translationX, maxX(scale.value));
      ty.value = clamp(y0.value + e.translationY, maxY(scale.value));
    })
    .onEnd((e) => {
      if (oneFinger.value) { if (scale.value < 1.05) { scale.value = withTiming(1); tx.value = withTiming(0); ty.value = withTiming(0); } return; }
      tx.value = withDecay({ velocity: e.velocityX, clamp: [-maxX(scale.value), maxX(scale.value)] });
      ty.value = withDecay({ velocity: e.velocityY, clamp: [-maxY(scale.value), maxY(scale.value)] });
    })
    .onFinalize(() => { panning.value = false; oneFinger.value = false; });

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
      <View style={[styles.page, { width, height, backgroundColor: background }]}>
        <Animated.View style={[styles.center, style]}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  page: { backgroundColor: color.bg, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
