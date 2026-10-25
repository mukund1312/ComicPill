import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { color } from '../../ui/tokens';

type Props = {
  getUri: () => Promise<string>;
  width: number;
  height: number;
  /** x is the tap position within the page, 0..width */
  onTap: (x: number) => void;
};

const MAX_SCALE = 4;

/** One full-screen page: pinch, double-tap zoom, and pan-when-zoomed (pan yields to the pager at 1×). */
export function ZoomableImage({ getUri, width, height, onTap }: Props) {
  const [uri, setUri] = useState<string | null>(null);
  const scale = useSharedValue(1); const savedScale = useSharedValue(1);
  const tx = useSharedValue(0); const ty = useSharedValue(0);
  const savedTx = useSharedValue(0); const savedTy = useSharedValue(0);

  useEffect(() => {
    let live = true;
    getUri().then((u) => { if (live) setUri(u); }).catch(() => undefined);
    return () => { live = false; };
  }, [getUri]);

  const clamp = () => {
    'worklet';
    const maxX = (width * (scale.value - 1)) / 2; const maxY = (height * (scale.value - 1)) / 2;
    tx.value = Math.min(maxX, Math.max(-maxX, tx.value)); ty.value = Math.min(maxY, Math.max(-maxY, ty.value));
  };

  const pinch = Gesture.Pinch()
    .onStart(() => { savedScale.value = scale.value; })
    .onUpdate((e) => { scale.value = Math.min(MAX_SCALE, Math.max(1, savedScale.value * e.scale)); clamp(); })
    .onEnd(() => {
      if (scale.value < 1.05) { scale.value = withTiming(1); tx.value = withTiming(0); ty.value = withTiming(0); }
    });

  // Manual activation: only take the touch when zoomed in, otherwise the horizontal pager scrolls.
  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_e, manager) => { if (scale.value > 1.01) manager.activate(); else manager.fail(); })
    .onStart(() => { savedTx.value = tx.value; savedTy.value = ty.value; })
    .onUpdate((e) => { tx.value = savedTx.value + e.translationX; ty.value = savedTy.value + e.translationY; clamp(); });

  const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd(() => {
    if (scale.value > 1.01) { scale.value = withTiming(1); tx.value = withTiming(0); ty.value = withTiming(0); }
    else scale.value = withTiming(2.5);
  });
  const singleTap = Gesture.Tap().runOnJS(true).requireExternalGestureToFail(doubleTap).onEnd((e) => onTap(e.x));

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={Gesture.Race(doubleTap, singleTap, Gesture.Simultaneous(pinch, pan))}>
      <View style={[styles.page, { width, height }]}>
        <Animated.View style={[styles.fill, style]}>
          {uri ? <Image source={{ uri }} style={styles.fill} contentFit="contain" recyclingKey={uri} /> : null}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: color.bg, overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
});
