// Opening a comic from its cover: the cover you tapped grows from where it sat to fill the screen, then gives way to the reader's page.
// The screen that owns the cover calls `launchCover` with the cover's view; the overlay (mounted once, above every screen) plays it; the
// reader calls `markReaderShown` when its first page is on screen. A timer ends it regardless, so it can never get stuck.
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, type View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { create } from 'zustand';
import { useReducedMotion } from '../lib/platform/motion';

type Launch = { uri: string; x: number; y: number; w: number; h: number; id: number };
type LaunchState = { launch: Launch | null; ready: boolean; start: (l: Omit<Launch, 'id'>) => void; markReady: () => void; clear: () => void };

let seq = 0;
const useLaunch = create<LaunchState>((set) => ({
  launch: null, ready: false,
  start: (l) => set({ launch: { ...l, id: ++seq }, ready: false }),
  markReady: () => set((s) => (s.launch && !s.ready ? { ready: true } : s)),
  clear: () => set({ launch: null, ready: false }),
}));

/** Measure the tapped cover, start the animation, then `go` (navigate). Without a cover picture it just goes. */
export function launchCover(view: View | null | undefined, uri: string | null | undefined, go: () => void) {
  if (!view || !uri) { go(); return; }
  view.measureInWindow((x, y, w, h) => {
    if (w > 0 && h > 0) useLaunch.getState().start({ uri, x, y, w, h });
    go();
  });
}

/** The reader's page is showing: the growing cover can fade away. */
export function markReaderShown() { useLaunch.getState().markReady(); }

const GROW_MS = 360;
const MAX_HOLD_MS = 1400;

export function CoverLaunchOverlay() {
  const launch = useLaunch((s) => s.launch); const ready = useLaunch((s) => s.ready); const clear = useLaunch((s) => s.clear);
  const reduced = useReducedMotion();
  const { width: W, height: H } = useWindowDimensions();
  const p = useSharedValue(0); const fade = useSharedValue(1);

  useEffect(() => {
    if (!launch) return;
    if (reduced) { clear(); return; }
    p.set(0); fade.set(1);
    p.set(withTiming(1, { duration: GROW_MS, easing: Easing.out(Easing.cubic) }));
    const t = setTimeout(() => useLaunch.getState().markReady(), MAX_HOLD_MS);
    return () => clearTimeout(t);
  }, [launch, reduced, clear, p, fade]);

  useEffect(() => {
    if (!launch || !ready) return;
    // Never cut the growth short: fade once it has landed.
    const wait = setTimeout(() => {
      fade.set(withTiming(0, { duration: 220, easing: Easing.in(Easing.quad) }, (done) => { if (done) runOnJS(clear)(); }));
    }, GROW_MS);
    return () => clearTimeout(wait);
  }, [launch, ready, fade, clear]);

  // Where it lands: the cover's own shape, as large as fits the screen, centred (like the reader's page).
  const ar = launch ? launch.w / launch.h : 0.66;
  const tw = Math.min(W, H * ar); const th = tw / ar;
  const tx = (W - tw) / 2; const ty = (H - th) / 2;
  const from = launch ?? { x: tx, y: ty, w: tw, h: th };
  const cover = useAnimatedStyle(() => ({
    left: interpolate(p.get(), [0, 1], [from.x, tx]), top: interpolate(p.get(), [0, 1], [from.y, ty]),
    width: interpolate(p.get(), [0, 1], [from.w, tw]), height: interpolate(p.get(), [0, 1], [from.h, th]),
    borderRadius: interpolate(p.get(), [0, 1], [12, 0]), opacity: fade.get(),
  }));
  const backdrop = useAnimatedStyle(() => ({ opacity: p.get() * fade.get() }));

  if (!launch) return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]} />
      <Animated.View style={[styles.cover, cover]}>
        <Image source={{ uri: launch.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 2000 },
  backdrop: { backgroundColor: '#000' },
  cover: { position: 'absolute', overflow: 'hidden' },
});
