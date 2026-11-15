// The opening moment, in the manner of a streaming app's logo sting: the ComicPill mark sits centred (exactly where the native splash left it),
// slides aside as the wordmark unrolls beside it, a soft light sweeps across the lettering, and the whole logo pushes gently towards you
// as it dissolves into the app. The lettering is a pre-rendered PNG (assets/comicpill-wordmark.png), so it is crisp at any size and never
// waits on a font.
import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import * as SplashScreen from 'expo-splash-screen';
import Animated, { Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '../lib/platform/motion';

const LOGO = require('../../assets/comicpillicon.png');
const WORDMARK = require('../../assets/comicpill-wordmark.png');
const BG = '#0A0A0D';

const ICON_START = 160;          // matches the native splash
const ICON_END = 84;
const WORD_H = 46;
const WORD_W = Math.round(WORD_H * (1613 / 331)); // the PNG's own proportions
const GAP = 12;
const LOCKUP_W = ICON_END + GAP + WORD_W;

export function BootSplash() {
  const reduced = useReducedMotion();
  const { width: screenW } = useWindowDimensions();
  const fit = Math.min(1, (screenW - 36) / LOCKUP_W); // never wider than a narrow phone
  const [done, setDone] = useState(false);
  const p = useSharedValue(0);      // 0 = mark alone, 1 = mark + wordmark
  const sweep = useSharedValue(0);  // light passing over the lettering, 0 -> 1
  const out = useSharedValue(1);    // overlay opacity (and the push-in as it goes)

  useEffect(() => {
    // Hand over from the native splash only once this view is on screen with the same logo in the same place.
    const t = setTimeout(() => { void SplashScreen.hideAsync().catch(() => undefined); }, 60);
    const finish = () => setDone(true);
    if (reduced) { out.value = withDelay(450, withTiming(0, { duration: 200 }, (ok) => { if (ok) runOnJS(finish)(); })); return () => clearTimeout(t); }
    p.value = withDelay(500, withTiming(1, { duration: 820, easing: Easing.out(Easing.cubic) }));
    sweep.value = withDelay(1250, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }));
    out.value = withDelay(2250, withTiming(0, { duration: 520, easing: Easing.in(Easing.quad) }, (ok) => { if (ok) runOnJS(finish)(); }));
    return () => clearTimeout(t);
  }, [p, sweep, out, reduced]);

  const lockup = useAnimatedStyle(() => ({
    transform: [{ scale: fit * interpolate(out.value, [1, 0], [1, 1.22]) }],
  }));
  const mark = useAnimatedStyle(() => {
    const size = interpolate(p.value, [0, 1], [ICON_START, ICON_END]);
    return { width: size, height: size, borderRadius: size * 0.22 };
  });
  const wordBox = useAnimatedStyle(() => ({
    width: interpolate(p.value, [0, 1], [0, WORD_W]),
    marginLeft: interpolate(p.value, [0, 1], [0, GAP]),
    opacity: interpolate(p.value, [0, 0.3, 1], [0, 0, 1]),
  }));
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(p.value, [0, 1], [-60, 0]) }] }));
  const band = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(sweep.value, [0, 1], [-WORD_W * 0.6, WORD_W * 1.1]) }], opacity: interpolate(sweep.value, [0, 0.1, 0.9, 1], [0, 1, 1, 0]) }));
  const fade = useAnimatedStyle(() => ({ opacity: out.value }));

  if (done) return null;
  return (
    <Animated.View pointerEvents="auto" style={[StyleSheet.absoluteFill, styles.root, fade]}>
      <Animated.View style={[styles.row, lockup]}>
        <Animated.View style={[styles.mark, mark]}><Image source={LOGO} style={StyleSheet.absoluteFill} contentFit="cover" /></Animated.View>
        <Animated.View style={[styles.wordBox, wordBox]}>
          <Animated.View style={[styles.wordInner, slide]}>
            <Image source={WORDMARK} style={styles.word} contentFit="contain" />
            {/* A soft band of light, shown only where the lettering is. */}
            <MaskedView style={StyleSheet.absoluteFill} maskElement={<Image source={WORDMARK} style={styles.word} contentFit="contain" />}>
              <Animated.View style={[styles.band, band]}>
                <LinearGradient colors={['#FFFFFF00', '#FFFFFFB8', '#FFFFFF00']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
              </Animated.View>
            </MaskedView>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: BG, zIndex: 3000, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  mark: { overflow: 'hidden' },
  wordBox: { overflow: 'hidden', height: WORD_H, justifyContent: 'center' },
  wordInner: { width: WORD_W, height: WORD_H },
  word: { width: WORD_W, height: WORD_H },
  band: { position: 'absolute', top: 0, bottom: 0, width: WORD_W * 0.45 },
});
