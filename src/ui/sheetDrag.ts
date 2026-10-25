// Drag a bottom sheet down to dismiss it. One behaviour for every sheet in the app, so they all feel the same:
// the sheet follows the finger, then either slides away (dragged far enough, or flicked) or springs back.
import { Gesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

const DISMISS_DISTANCE = 90;
const DISMISS_VELOCITY = 900;
const OFFSCREEN = 900;

export function useSheetDrag(onClose?: () => void) {
  const y = useSharedValue(0);
  const close = () => { onClose?.(); };
  const gesture = Gesture.Pan()
    .enabled(!!onClose)
    // Only a clearly vertical drag counts, so taps, text fields and sideways swipes inside the sheet still work.
    .activeOffsetY([10, 10000])
    .failOffsetX([-24, 24])
    .onUpdate((e) => { y.value = Math.max(0, e.translationY); })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        y.value = withTiming(OFFSCREEN, { duration: 180 }, (finished) => { if (finished) scheduleOnRN(close); });
      } else {
        y.value = withSpring(0, { damping: 22, stiffness: 260 });
      }
    });
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return { gesture, style };
}
