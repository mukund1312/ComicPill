// The opening moment: the ComicPill mark appears centred (exactly where the native splash left it), then slides aside as
// the name unrolls beside it — the way a streaming app's logo becomes its wordmark — and the whole thing dissolves into the app.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import Animated, { Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '../lib/platform/motion';

const LOGO = require('../../assets/comicpillicon.png');
const BG = '#0A0A0D';
const WORD_W = 214;

export function BootSplash() {
  const reduced = useReducedMotion();
  const [done, setDone] = useState(false);
  const p = useSharedValue(0);      // 0 = logo alone, 1 = logo + wordmark
  const out = useSharedValue(1);    // overlay opacity

  useEffect(() => {
    // Hand over from the native splash only once this view is on screen with the same logo in the same place.
    const t = setTimeout(() => { void SplashScreen.hideAsync().catch(() => undefined); }, 60);
    const finish = () => setDone(true);
    if (reduced) { out.value = withDelay(450, withTiming(0, { duration: 200 }, (ok) => { if (ok) runOnJS(finish)(); })); return () => clearTimeout(t); }
    p.value = withDelay(520, withTiming(1, { duration: 760, easing: Easing.out(Easing.cubic) }));
    out.value = withDelay(2000, withTiming(0, { duration: 420, easing: Easing.inOut(Easing.quad) }, (ok) => { if (ok) runOnJS(finish)(); }));
    return () => clearTimeout(t);
  }, [p, out, reduced]);

  const logo = useAnimatedStyle(() => {
    const size = interpolate(p.value, [0, 1], [160, 78]);
    return { width: size, height: size, borderRadius: size * 0.22 };
  });
  const word = useAnimatedStyle(() => ({ width: interpolate(p.value, [0, 1], [0, WORD_W]), opacity: interpolate(p.value, [0, 0.35, 1], [0, 0, 1]) }));
  const letters = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(p.value, [0, 1], [-46, 0]) }] }));
  const fade = useAnimatedStyle(() => ({ opacity: out.value }));

  if (done) return null;
  return (
    <Animated.View pointerEvents="auto" style={[StyleSheet.absoluteFill, styles.root, fade]}>
      <View style={styles.row}>
        <Animated.View style={[styles.logo, logo]}><Image source={LOGO} style={StyleSheet.absoluteFill} contentFit="cover" /></Animated.View>
        <Animated.View style={[styles.word, word]}>
          <Animated.View style={letters}><Text numberOfLines={1} style={styles.text}>Comic<Text style={styles.pill}>Pill</Text></Text></Animated.View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: BG, zIndex: 3000, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  logo: { overflow: 'hidden' },
  word: { overflow: 'hidden', justifyContent: 'center', marginLeft: 10 },
  text: { color: '#F5F5F7', fontFamily: 'Inter_800ExtraBold', fontSize: 40, letterSpacing: -1.4, width: WORD_W },
  pill: { color: '#F23546' },
});
