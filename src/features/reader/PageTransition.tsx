import { useMemo, type PropsWithChildren, type ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import type { PageAnimation } from '../../lib/reader/readerSettings';

/**
 * Page-turn effects, driven by the scroll position on the UI thread (no JS work while you swipe).
 * `p` is how far this page is from centre: 0 centred, +1 fully gone to the left, −1 waiting on the right.
 *
 * Fade: every page stays put and cross-fades.
 * Flip: a book page. Every page is pinned to the screen. The one on the left of centre (p > 0, the page being turned, or turned back) swings
 * about the left edge (the spine) in 3-D perspective, darkening as it turns away, and the next page waits underneath with a shadow that lifts
 * as it is uncovered. Because forward and back are the same picture run the other way, both directions work alike.
 * Flip on a two-page spread (landscape): an open book. The spine is the middle of the screen; the right page lifts about it and lands on the left
 * as the next spread's left page, the left page staying put until it lands on it, and the next right page waiting underneath.
 */
const MAX_TURN_DEG = 100;

const PERSPECTIVE = 1400;
/** Where the free edge of the page being turned is on screen when it has turned `q` (0..1) of the way, perspective included. */
const freeEdge = (q: number, width: number) => {
  'worklet';
  const a = q * MAX_TURN_DEG * (Math.PI / 180);
  if (a >= Math.PI / 2) return 0;
  // The free edge swings toward the viewer, so it lands further out than its flat position would.
  return Math.max(0, Math.min(width, (width * Math.cos(a) * PERSPECTIVE) / (PERSPECTIVE - width * Math.sin(a))));
};

type Props = PropsWithChildren<{
  index: number; width: number; scrollX: SharedValue<number>; kind: PageAnimation;
  /** This reading unit is two pages side by side. */
  paired?: boolean;
  /** Non-interactive copies of this unit and the next one, for the open-book turn. */
  ghost?: ReactNode; nextGhost?: ReactNode;
}>;

export function TransitionPage({ index, width, scrollX, kind, paired, ghost, nextGhost, children }: Props) {
  const book = kind === 'flip' && !!paired;
  const half = width / 2;

  const style = useAnimatedStyle(() => {
    const p = (scrollX.value - index * width) / width;
    // Off-screen pages (or a scroll value that hasn't caught up with the first layout) stay untouched.
    if (kind === 'slide' || kind === 'curl' || p <= -1 || p >= 1) return { opacity: 1, width, transform: [{ translateX: 0 }] };
    if (kind === 'fade') return { opacity: 1 - Math.abs(p), width, transform: [{ translateX: p * width }] };
    if (book) return { opacity: 1, width, transform: [{ translateX: p * width }] }; // pinned; the turning is drawn by the sheet below
    // Flip. The page waiting underneath is pinned and shown only to the right of the turning page's free edge, so the two never overlap.
    if (p < 0) { const edge = freeEdge(p + 1, width); return { opacity: 1, width: Math.max(1, width - edge), transform: [{ translateX: p * width + edge }] }; }
    // The page being turned is pinned and swings about the left edge.
    return {
      opacity: 1,
      width,
      transform: [{ translateX: p * width }, { perspective: PERSPECTIVE }, { rotateY: `${interpolate(p, [0, 1], [0, -MAX_TURN_DEG], Extrapolation.CLAMP)}deg` }],
    };
  });
  // Inside the clipped page underneath, the picture itself stays where it belongs on screen.
  const body = useAnimatedStyle(() => {
    const p = (scrollX.value - index * width) / width;
    return { width, transform: [{ translateX: kind === 'flip' && !book && p < 0 && p > -1 ? -freeEdge(p + 1, width) : 0 }] };
  });

  // Darkening as the page turns away, and the shadow on the page below that lifts as it is uncovered.
  const shade = useAnimatedStyle(() => {
    const p = (scrollX.value - index * width) / width;
    if (kind !== 'flip' || book || p <= -1 || p >= 1) return { opacity: 0 };
    return { opacity: p > 0 ? interpolate(p, [0, 1], [0, 0.6], Extrapolation.CLAMP) : interpolate(p, [-1, 0], [0.5, 0], Extrapolation.CLAMP) };
  });
  // On the page underneath: a soft shadow cast by the free edge of the page above, travelling across it as that page turns.
  const cast = useAnimatedStyle(() => {
    const p = (scrollX.value - index * width) / width;
    if (kind !== 'flip' || book || p <= -1 || p >= 0) return { opacity: 0, transform: [{ translateX: 0 }] };
    const q = p + 1; // how far the page above has turned
    return { opacity: interpolate(q, [0, 0.08, 0.8, 1], [0, 1, 0.8, 0], Extrapolation.CLAMP) };
  });

  // ---- open book: the cell's own picture keeps only its left half while it turns, and a sheet about the spine is drawn over its right ----
  const main = useAnimatedStyle(() => {
    const p = (scrollX.value - index * width) / width;
    return { width: book && p > 0.001 && p < 1 ? half : width };
  });
  const sheet = useAnimatedStyle(() => {
    const p = (scrollX.value - index * width) / width;
    if (!book || p <= 0 || p >= 1) return { opacity: 0, transform: [{ perspective: 1800 }, { rotateY: '0deg' }] };
    return { opacity: 1, transform: [{ perspective: 1800 }, { rotateY: `${-p * 180}deg` }] };
  });
  const frontShade = useAnimatedStyle(() => {
    const p = (scrollX.value - index * width) / width;
    return { opacity: book && p > 0 && p < 1 ? interpolate(p, [0, 0.5], [0, 0.55], Extrapolation.CLAMP) : 0 };
  });
  const backShade = useAnimatedStyle(() => {
    const p = (scrollX.value - index * width) / width;
    return { opacity: book && p > 0 && p < 1 ? interpolate(p, [0.5, 1], [0.55, 0], Extrapolation.CLAMP) : 0 };
  });
  const spine = useAnimatedStyle(() => {
    const p = (scrollX.value - index * width) / width;
    return { opacity: book && p > 0 && p < 1 ? Math.sin(Math.PI * p) * 0.9 : 0 };
  });

  // The curl is drawn over the whole pager by PageCurlLayer, so the pages themselves just slide.
  if (kind === 'slide' || kind === 'curl') return <>{children}</>;
  if (kind === 'fade') return <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>;

  if (book) {
    return (
      <View style={{ width, flex: 1 }}>
        <Animated.View style={[{ flex: 1 }, style]}>
          <Animated.View style={[styles.clip, main]}><View style={{ width, height: '100%' }}>{children}</View></Animated.View>
          {/* The sheet: this unit's right page on its front, the next unit's left page on its back. */}
          <Animated.View pointerEvents="none" style={[styles.sheet, { left: half, width: half }, sheet]}>
            <View style={styles.face}>
              <Half node={ghost} width={width} half={half} side="right" />
              <Animated.View style={[StyleSheet.absoluteFill, styles.shade, frontShade]} />
            </View>
            <View style={[styles.face, styles.backFace]}>
              <Half node={nextGhost} width={width} half={half} side="left" />
              <Animated.View style={[StyleSheet.absoluteFill, styles.shade, backShade]} />
            </View>
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.spine, { left: half - 2 }, spine]}>
            <LinearGradient colors={['#00000000', '#00000088', '#00000000']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </Animated.View>
      </View>
    );
  }

  // The cell keeps its full size whatever the page inside does, or the pages after it would shift.
  return (
    <View style={{ width, flex: 1 }}>
      <Animated.View style={[{ flex: 1, overflow: 'hidden' }, style, styles.hinge]}>
        <Animated.View style={[{ flex: 1 }, body]}>{children}</Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shade, shade]} />
        <Animated.View pointerEvents="none" style={[styles.cast, cast]}>
          <LinearGradient colors={['#00000099', '#00000000']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** One half of a unit, cropped out of a full-size non-interactive copy of it. */
function Half({ node, width, half, side }: { node: ReactNode; width: number; half: number; side: 'left' | 'right' }) {
  return (
    <View style={{ width: half, flex: 1, overflow: 'hidden' }}>
      <View style={{ width, flex: 1, marginLeft: side === 'right' ? -half : 0 }}>{node}</View>
    </View>
  );
}

/** Earlier pages draw above later ones, so the page being turned is always on top of the one it uncovers. */
export function useStackedCells(total: number, enabled: boolean): ((props: ViewProps & { index: number; children?: ReactNode }) => ReactNode) | undefined {
  return useMemo(() => {
    if (!enabled) return undefined;
    return function StackedCell({ index, style, children, ...rest }) {
      return <View {...rest} style={[style, { zIndex: total - index }]}>{children}</View>;
    };
  }, [total, enabled]);
}

const styles = StyleSheet.create({
  hinge: { transformOrigin: 'left center' },
  shade: { backgroundColor: '#000' },
  // 56px strip that starts at the free edge of the page above and fades out to the right.
  cast: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 56 },
  clip: { overflow: 'hidden', height: '100%' },
  sheet: { position: 'absolute', top: 0, bottom: 0, transformOrigin: 'left center' },
  face: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backfaceVisibility: 'hidden' },
  backFace: { transform: [{ rotateY: '180deg' }] },
  spine: { position: 'absolute', top: 0, bottom: 0, width: 4 },
});
