import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDecay, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { color } from '../../ui/tokens';
import type { Panel } from '../../lib/reader/guided/panels';
import { cameraFor } from '../../lib/reader/guided/camera';

export type ZoomHandle = {
  /** Animate to fill the view with a panel (normalised to the content); null returns to the full page. */
  zoomToPanel(panel: Panel | null, durationMs?: number, clampToPage?: boolean): void;
  /** The live camera (scale and offset), for anything that has to follow it frame by frame, such as the panel mask. */
  camera: { scale: SharedValue<number>; tx: SharedValue<number>; ty: SharedValue<number> };
  /** The page's on-screen size at rest, and the view it sits in. */
  content: { width: number; height: number };
  view: { width: number; height: number };
  /** A touch point in the view → where it lands on the page (0..1), whatever the current zoom and pan. */
  pointToContent(x: number, y: number): { x: number; y: number };
  /** The other way: a point on the page (0..1) → where it is in the view right now. */
  contentToScreen(x: number, y: number): { x: number; y: number };
};

type Props = {
  width: number;
  height: number;
  /** Size of the visible content inside the view (after fit); pan bounds follow it. Defaults to the view. */
  contentWidth?: number;
  contentHeight?: number;
  /** x is the tap position within the view, 0..width */
  onTap: (x: number, y: number) => void;
  /** When given, a double-tap calls this (with the tap position) instead of zooming in and out by itself. */
  onDoubleTap?: (x: number, y: number) => void;
  /** Drag the page down (while it is not zoomed) and let go: leave the comic. */
  onPullDown?: () => void;
  background?: string;
  /** Draw only: no gestures and no pan or zoom. Used for the copies of a page that the page-turn effects animate. */
  passive?: boolean;
  children: ReactNode;
};

const MAX_SCALE = 6;
const DOUBLE_TAP_SCALE = 2.5;
const EDGE_SLACK = 2;
/** Finger travel before pan decides between moving the picture and handing off to the pager. */
const DECIDE_AFTER = 8;
/** How far (or how fast) a downward pull has to go to leave the comic. */
const PULL_EXIT_DISTANCE = 140;
const PULL_EXIT_VELOCITY = 900;
/** A second touch this soon after the first lift, and this close, starts a one-finger zoom. */
const ONE_FINGER_WINDOW_MS = 300;
const ONE_FINGER_RADIUS = 48;
/** Pixels of drag per doubling when zooming with one finger. */
const ONE_FINGER_PER_DOUBLING = 140;

/**
 * Pinch (about the fingers), double-tap (about the tap), and pan with momentum. At 1× — or when
 * pushed against an edge — pan steps aside so the pager can swipe to the next page.
 */
export const ZoomableView = forwardRef<ZoomHandle, Props>(function ZoomableView({ width, height, contentWidth = width, contentHeight = height, onTap, onDoubleTap, onPullDown, background = color.bg, passive = false, children }, ref) {
  // A fit-width page can be taller than the screen: it scrolls vertically even at 1×.
  const tallPage = contentHeight > height + 1;
  // Tall pages start at the top, not the middle. (A rotation re-mounts the list, so this runs again.)
  const scale = useSharedValue(1); const tx = useSharedValue(0); const ty = useSharedValue(tallPage ? (contentHeight - height) / 2 : 0);
  const s0 = useSharedValue(1); const x0 = useSharedValue(0); const y0 = useSharedValue(0);
  const startTouchX = useSharedValue(0); const startTouchY = useSharedValue(0);
  const lastUpAt = useSharedValue(0); const lastUpX = useSharedValue(0); const lastUpY = useSharedValue(0);
  const oneFinger = useSharedValue(false); const panning = useSharedValue(false); const pulling = useSharedValue(false);

  const maxX = (s: number) => { 'worklet'; return Math.max(0, (contentWidth * s - width) / 2); };
  const maxY = (s: number) => { 'worklet'; return Math.max(0, (contentHeight * s - height) / 2); };
  const clamp = (v: number, limit: number) => { 'worklet'; return Math.min(limit, Math.max(-limit, v)); };

  useImperativeHandle(ref, () => ({
    pointToContent(x, y) {
      const sc = scale.value;
      return { x: (x - width / 2 - tx.value) / (sc * contentWidth) + 0.5, y: (y - height / 2 - ty.value) / (sc * contentHeight) + 0.5 };
    },
    contentToScreen(x, y) {
      const sc = scale.value;
      return { x: width / 2 + tx.value + (x - 0.5) * contentWidth * sc, y: height / 2 + ty.value + (y - 0.5) * contentHeight * sc };
    },
    zoomToPanel(panel, durationMs = 320, clampToPage = true) {
      const cfg = { duration: durationMs, easing: Easing.inOut(Easing.cubic) };
      if (!panel) { scale.value = withTiming(1, cfg); tx.value = withTiming(0, cfg); ty.value = withTiming(0, cfg); return; }
      // One shared calculation (lib/reader/guided/camera) decides where the page goes, so the mask and taps agree with the picture.
      const cam = cameraFor(panel, { width: contentWidth, height: contentHeight }, { width, height }, { clamp: clampToPage });
      scale.value = withTiming(cam.scale, cfg); tx.value = withTiming(cam.tx, cfg); ty.value = withTiming(cam.ty, cfg);
    },
    camera: { scale, tx, ty },
    content: { width: contentWidth, height: contentHeight },
    view: { width, height },
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
      if (scale.value <= 1.01 && !tallPage) {
        // Not zoomed: sideways belongs to the pager; a clear downward pull leaves the comic.
        if (!onPullDown || e.numberOfTouches !== 1) { manager.fail(); return; }
        const pdx = (e.allTouches[0]?.x ?? 0) - startTouchX.value; const pdy = (e.allTouches[0]?.y ?? 0) - startTouchY.value;
        if (pdy > DECIDE_AFTER * 2 && pdy > Math.abs(pdx) * 1.5) { pulling.value = true; manager.activate(); }
        else if (Math.abs(pdx) > DECIDE_AFTER || pdy < -DECIDE_AFTER) manager.fail();
        return;
      }
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
      if (pulling.value) { ty.value = Math.max(0, e.translationY); return; }
      tx.value = clamp(x0.value + e.translationX, maxX(scale.value));
      ty.value = clamp(y0.value + e.translationY, maxY(scale.value));
    })
    .onEnd((e) => {
      if (pulling.value) {
        if (onPullDown && (e.translationY > PULL_EXIT_DISTANCE || e.velocityY > PULL_EXIT_VELOCITY)) runOnJS(onPullDown)(); else ty.value = withSpring(0);
        return;
      }
      if (oneFinger.value) { if (scale.value < 1.05) { scale.value = withTiming(1); tx.value = withTiming(0); ty.value = withTiming(0); } return; }
      tx.value = withDecay({ velocity: e.velocityX, clamp: [-maxX(scale.value), maxX(scale.value)] });
      ty.value = withDecay({ velocity: e.velocityY, clamp: [-maxY(scale.value), maxY(scale.value)] });
    })
    .onFinalize(() => { panning.value = false; oneFinger.value = false; pulling.value = false; });

  const doubleTap = Gesture.Tap().numberOfTaps(2).maxDuration(250).onEnd((e) => {
    if (onDoubleTap) { runOnJS(onDoubleTap)(e.x, e.y); return; }
    if (scale.value > 1.01) { scale.value = withTiming(1); tx.value = withTiming(0); ty.value = withTiming(0); return; }
    const cx = e.x - width / 2; const cy = e.y - height / 2;
    scale.value = withTiming(DOUBLE_TAP_SCALE);
    tx.value = withTiming(clamp(-(DOUBLE_TAP_SCALE - 1) * cx, maxX(DOUBLE_TAP_SCALE)));
    ty.value = withTiming(clamp(-(DOUBLE_TAP_SCALE - 1) * cy, maxY(DOUBLE_TAP_SCALE)));
  });
  const singleTap = Gesture.Tap().runOnJS(true).maxDuration(250).onEnd((e) => onTap(e.x, e.y));

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  if (passive) return <View style={[styles.page, { width, height, backgroundColor: background }]}><View style={styles.center}>{children}</View></View>;
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
