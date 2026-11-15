import { useEffect, useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { cancelAnimation, scrollTo, useAnimatedReaction, useSharedValue, withSpring, type AnimatedRef, type SharedValue } from 'react-native-reanimated';
import { releaseTarget } from './curlMath';

/**
 * The settle after release. Slightly under-damped so it arrives briskly, and clamped so it stops the moment it reaches the page instead of
 * bouncing or creeping the last pixels (an over-damped spring leaves a sliver of the next page showing for a long time). It starts at the
 * finger's speed, so a hard flick lands faster than a gentle let-go.
 */
const SETTLE_SPRING = (velocity: number) => {
  'worklet';
  return { velocity, damping: 20, stiffness: 180, mass: 1, overshootClamping: true };
};

/** What the page's zoom view tells the page-turn drag: whether the page is zoomed in, and whether this drag has pushed it against its side. */
/** Milliseconds, for measuring the finger's speed on the UI thread. */
function clock() {
  'worklet';
  return Date.now();
}

export type PagerGate = { zoomed: SharedValue<boolean>; handoff: SharedValue<boolean> };

export type CurlGrab = {
  /** Screen point where the finger took hold of the page (or last touched it). */
  x: SharedValue<number>;
  y: SharedValue<number>;
  /** The page the pager rested on when that happened: a turn away from it holds the touched point; a turn back to the page before holds its edge. */
  from: SharedValue<number>;
  /** The finger's vertical travel since then, in pixels; held as it was when the finger lifts so the settle keeps the same fold. */
  dy: SharedValue<number>;
};

/**
 * Turning pages by hand for the page curl. The pager's own scrolling is switched off and this gesture moves it instead, which is what lets the
 * curl know where the page was grabbed and where the finger is (a native scroll reports only its offset). Everything runs on the UI thread:
 * the finger moves the pager 1:1, and on release a spring that starts at the finger's speed carries it to the page `releaseTarget` picks.
 * Taps still turn pages (through the pager's own animated scroll); the touch-down records the grab height for those too.
 */
export function useCurlDrag(listRef: AnimatedRef<never>, scrollX: SharedValue<number>, width: number, lastIndex: number, current: number, enabled: boolean) {
  // The page the reader is on. The pager reports its offset only once it has scrolled, so straight after a comic opens (at its saved page)
  // the offset can still read 0; a drag must start from the page on screen, not jump to the first one.
  const here = useSharedValue(current);
  useEffect(() => { here.set(current); }, [here, current]);
  const grabX = useSharedValue(0);
  const grabY = useSharedValue(0);
  const grabFrom = useSharedValue(0);
  const grabDy = useSharedValue(0);
  const offset = useSharedValue(0);
  const driving = useSharedValue(false);
  const start = useSharedValue(0);
  const startPage = useSharedValue(0);
  const downX = useSharedValue(0);
  const downY = useSharedValue(0);
  // The finger's own speed, measured from its last moves (some touch sources report no velocity on release).
  const lastX = useSharedValue(0);
  const lastT = useSharedValue(0);
  const speed = useSharedValue(0);
  const downT = useSharedValue(0);
  // Set by the page's zoom view: a zoomed page pans under the finger, unless it has been pushed against its side (then the page turns).
  const zoomedSV = useSharedValue(false);
  const handoffSV = useSharedValue(false);
  const gate: PagerGate = useMemo(() => ({ zoomed: zoomedSV, handoff: handoffSV }), [zoomedSV, handoffSV]);

  const restingOffset = () => {
    'worklet';
    const x = scrollX.get(); const k = here.get() * width;
    return Math.abs(x - k) < width ? x : k;
  };

  useAnimatedReaction(() => offset.get(), (x, prev) => {
    if (driving.get() && x !== prev) scrollTo(listRef, x, 0, false);
  }, [listRef]);

  const follow = (x: number, y: number, sample: boolean) => {
    'worklet';
    const now = clock(); const dt = now - lastT.get();
    // Moves that arrive together (a few ms apart) say nothing about speed; the lift itself is not a move.
    if (sample && dt >= 4) { speed.set(speed.get() * 0.3 + (((x - lastX.get()) / dt) * 1000) * 0.7); lastX.set(x); lastT.set(now); }
    offset.set(Math.max(0, Math.min(lastIndex * width, start.get() - (x - downX.get()))));
    grabDy.set(y - downY.get());
  };

  const gesture = useMemo(() => Gesture.Pan()
    .enabled(enabled)
    .manualActivation(true)
    .onTouchesDown((e) => {
      const x = e.allTouches[0]?.x ?? 0; const y = e.allTouches[0]?.y ?? 0;
      downX.set(x); downY.set(y); lastX.set(x); lastT.set(clock()); downT.set(clock()); speed.set(0);
      // While a released page is still settling, a tap leaves its fold alone; a new drag (onStart) catches it where it is.
      if (!driving.get()) { grabX.set(x); grabY.set(y); grabDy.set(0); grabFrom.set(Math.round(restingOffset() / Math.max(width, 1))); }
    })
    .onTouchesMove((e, manager) => {
      if (e.numberOfTouches !== 1) { manager.fail(); return; }
      const dx = (e.allTouches[0]?.x ?? 0) - downX.get(); const dy = (e.allTouches[0]?.y ?? 0) - downY.get();
      // Sideways (diagonals included) turns the page; mostly downwards is the pull to close the comic, which the page view handles.
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 0.7) {
        // Zoomed in, the page view pans; it says so (by taking the touch) or hands over once the page is against its side.
        if (!gate.zoomed.get() || gate.handoff.get()) manager.activate();
      } else if (Math.abs(dy) > 40) manager.fail();
    })
    .onStart(() => {
      cancelAnimation(offset);
      const x0 = driving.get() ? offset.get() : restingOffset();
      start.set(x0); offset.set(x0);
      startPage.set(Math.round(x0 / Math.max(width, 1)));
      grabX.set(downX.get()); grabY.set(downY.get()); grabDy.set(0); grabFrom.set(startPage.get());
      driving.set(true);
    })
    .onUpdate((e) => { follow(e.x, e.y, true); })
    .onEnd((e, success) => {
      follow(e.x, e.y, false);
      // The touch system's release velocity when it has one; otherwise the finger's measured speed, or for a short flick its average speed.
      const took = clock() - downT.get();
      const average = took > 0 && took < 300 ? ((e.x - downX.get()) / took) * 1000 : 0;
      const v = Math.abs(e.velocityX) > 1 ? e.velocityX : Math.abs(average) > Math.abs(speed.get()) ? average : speed.get();
      const target = success ? releaseTarget(offset.get(), startPage.get(), v, width, lastIndex) : startPage.get();
      offset.set(withSpring(target * width, SETTLE_SPRING(-v), (done) => {
        if (done) driving.set(false);
      }));
    }), [enabled, width, lastIndex, scrollX, here, offset, driving, start, startPage, downX, downY, grabX, grabY, grabFrom, grabDy, lastX, lastT, speed, downT, gate]);

  const grab: CurlGrab = useMemo(() => ({ x: grabX, y: grabY, from: grabFrom, dy: grabDy }), [grabX, grabY, grabFrom, grabDy]);
  return { gesture, grab, gate };
}
