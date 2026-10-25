import type { PropsWithChildren } from 'react';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import type { PageAnimation } from '../../lib/reader/readerSettings';

/**
 * Page-turn effects, driven by the scroll position on the UI thread (no JS work while you swipe).
 * `p` is how far this page is from centre: 0 centred, +1 fully gone to the left, −1 waiting on the right.
 */
export function TransitionPage({ index, width, scrollX, kind, children }: PropsWithChildren<{ index: number; width: number; scrollX: SharedValue<number>; kind: PageAnimation }>) {
  const style = useAnimatedStyle(() => {
    const p = (scrollX.value - index * width) / width;
    // Off-screen pages (or a scroll value that hasn't caught up with the first layout) stay untouched.
    if (kind === 'slide' || p <= -1 || p >= 1) return { opacity: 1, transform: [{ translateX: 0 }] };
    const a = Math.abs(p);
    if (kind === 'fade') return { opacity: 1 - a, transform: [{ translateX: p * width }] }; // pages stay put and cross-fade
    // Page flip: the leaving page swings away on a hinge while the next one swings in.
    return {
      opacity: 1 - a * 0.55,
      transform: [{ perspective: 900 }, { translateX: p * width * 0.25 }, { rotateY: `${interpolate(p, [-1, 0, 1], [58, 0, -58])}deg` }, { scale: 1 - a * 0.08 }],
    };
  });
  if (kind === 'slide') return <>{children}</>;
  return <Animated.View style={[{ width, flex: 1 }, style]}>{children}</Animated.View>;
}
