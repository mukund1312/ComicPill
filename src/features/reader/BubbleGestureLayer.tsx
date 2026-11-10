import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, withTiming, type SharedValue } from 'react-native-reanimated';

type Props = {
  /** `focus`: a balloon is up close, so a slide moves between balloons. `draw`: drag a box around a balloon by hand. */
  mode: 'focus' | 'draw';
  width: number;
  rtl: boolean;
  /** Written while a finger slides: −1…+1 toward the previous (−) or next (+) balloon, for the float layer to draw. */
  skim: SharedValue<number>;
  onTap: (x: number, y: number) => void;
  onDoubleTap: () => void;
  /** A slide that was let go past the halfway-ish mark (or flicked): −1 previous, +1 next. */
  onCommit: (dir: -1 | 1) => void;
  onDraw: (x0: number, y0: number, x1: number, y1: number) => void;
};

// Writes go through these so they stay plain worklet calls (the compiler lint cannot see through a shared value passed in as a prop).
function put(sv: SharedValue<number>, v: number) { 'worklet'; sv.value = v; }
function ease(sv: SharedValue<number>, v: number) { 'worklet'; sv.value = withTiming(v, { duration: 180 }); }

/** A touch that travels further than this is a slide, never a tap. */
const TAP_SLOP = 12;
/** Finger travel that carries a slide all the way from one balloon to the next. */
const TRAVEL = 0.55;
const COMMIT_AT = 0.3;
const FLICK = 700;

/** Catches touches over the page while a balloon is up close or being corrected, so they cannot turn the page by accident. */
export function BubbleGestureLayer({ mode, width, rtl, skim, onTap, onDoubleTap, onCommit, onDraw }: Props) {
  const [rect, setRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const gesture = useMemo(() => {
    if (mode === 'draw') {
      return Gesture.Pan().runOnJS(true).minDistance(6)
        .onStart((e) => setRect({ x0: e.x - e.translationX, y0: e.y - e.translationY, x1: e.x, y1: e.y }))
        .onUpdate((e) => setRect({ x0: e.x - e.translationX, y0: e.y - e.translationY, x1: e.x, y1: e.y }))
        .onEnd((e) => { onDraw(e.x - e.translationX, e.y - e.translationY, e.x, e.y); })
        .onFinalize(() => setRect(null));
    }
    const double = Gesture.Tap().runOnJS(true).numberOfTaps(2).maxDuration(250).maxDistance(TAP_SLOP).onEnd(() => onDoubleTap());
    const single = Gesture.Tap().runOnJS(true).maxDuration(250).maxDistance(TAP_SLOP).onEnd((e) => onTap(e.x, e.y));
    // The slide runs on the UI thread: the finger writes `skim` directly, so nothing waits on JavaScript while it moves.
    const slide = Gesture.Pan().activeOffsetX([-14, 14]).failOffsetY([-40, 40])
      .onUpdate((e) => {
        const t = (rtl ? e.translationX : -e.translationX) / (width * TRAVEL);
        put(skim, Math.max(-1, Math.min(1, t)));
      })
      .onEnd((e) => {
        const toward = rtl ? e.velocityX : -e.velocityX;
        const dir = skim.value >= 0 ? 1 : -1;
        if (Math.abs(skim.value) > COMMIT_AT || (Math.abs(toward) > FLICK && Math.sign(toward) === dir)) runOnJS(onCommit)(dir);
        else ease(skim, 0);
      });
    return Gesture.Exclusive(double, Gesture.Race(slide, single));
  }, [mode, width, rtl, skim, onTap, onDoubleTap, onCommit, onDraw]);

  return (
    <GestureDetector gesture={gesture}>
      <View style={StyleSheet.absoluteFill} collapsable={false}>
        {rect ? (
          <View pointerEvents="none" style={[styles.box, { left: Math.min(rect.x0, rect.x1), top: Math.min(rect.y0, rect.y1), width: Math.abs(rect.x1 - rect.x0), height: Math.abs(rect.y1 - rect.y0) }]} />
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', borderWidth: 2, borderColor: '#fff', borderRadius: 6, backgroundColor: '#ffffff26' },
});
