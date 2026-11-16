// The moment between picking and seeing: the reader's picks drift together, then
// a core pulses while status lines walk through what is being worked out. It runs
// about 7 seconds on purpose — the saving itself is instant; the pause is there so
// the reveal feels earned. If saving fails the screen says so and offers a
// retry — it never pretends. Reduce-motion swaps the drift for a still message.
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming, Easing, FadeIn } from 'react-native-reanimated';
import { EntityImage } from './EntityImage';
import { CREATOR_PHOTOS } from '../../lib/onboarding/creatorPhotos';
import { Button } from '../../ui/primitives';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { useReducedMotion } from '../../lib/platform/motion';
import { CHARACTER_BY_ID, CREATOR_BY_ID } from '../../lib/onboarding/entities';
import type { TasteSelections } from '../../lib/onboarding/taste';
import { saveOnboardingTaste } from '../../lib/db/queries/onboardingData';

const RADIUS = 104;
const AVATAR = 52;
const TOTAL_MS = 7000;
const REDUCED_MS = 2800;
const CORE = 92;

function avatarsOf(sel: TasteSelections): { key: string; name: string; workId?: string; photo?: ImageSourcePropType }[] {
  const chars = sel.characters.flatMap((id) => { const e = CHARACTER_BY_ID.get(id); return e ? [{ key: id, name: e.name, workId: e.signatureWorkId }] : []; });
  const makers = [...sel.artists, ...sel.writers].flatMap((id) => { const e = CREATOR_BY_ID.get(id); return e ? [{ key: id, name: e.name, photo: CREATOR_PHOTOS[id] }] : []; });
  return [...chars.slice(0, 6), ...makers.slice(0, 2)];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Status lines drawn from what the reader actually picked. */
export function statusLines(sel: TasteSelections): string[] {
  const out: string[] = [];
  if (sel.characters.length) out.push(`Reading your ${plural(sel.characters.length, 'character', 'characters')}…`);
  if (sel.artStyles.length) out.push(`Studying the ${plural(sel.artStyles.length, 'art style', 'art styles')} you like…`);
  if (sel.artists.length + sel.writers.length) out.push(`Looking at ${plural(sel.artists.length + sel.writers.length, 'creator', 'creators')} you follow…`);
  if (sel.genres.length || sel.traits.length) out.push('Weighing genres and how you like stories to feel…');
  out.push('Connecting the dots between your picks…', 'Checking what the catalog has for you…', 'Shaping your starting taste…');
  return out;
}

function Drifter({ dx, dy, index, name, workId, photo }: { dx: number; dy: number; index: number; name: string; workId?: string; photo?: ImageSourcePropType }) {
  const p = useSharedValue(0);
  useEffect(() => { p.set(withDelay(index * 90, withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.cubic) }))); }, [index, p]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: dx * (1 - p.get()) }, { translateY: dy * (1 - p.get()) }, { scale: 1 - 0.6 * p.get() }],
    opacity: 1 - 0.85 * p.get(),
  }));
  return <Animated.View style={[styles.drifter, style]}><EntityImage workId={workId} photo={photo} name={name} size={AVATAR} /></Animated.View>;
}

/** An expanding, fading ring; three of these, offset, read as the machine working. */
function Ring({ delay, color }: { delay: number; color: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(delay, withRepeat(withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }), -1, false)));
    return () => cancelAnimation(p);
  }, [delay, p]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 1.7 * p.get() }], opacity: 0.55 * (1 - p.get()) }));
  return <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: color }, style]} />;
}

function Core({ color, fill }: { color: string; fill: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true));
    return () => cancelAnimation(p);
  }, [p]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 0.9 + 0.14 * p.get() }] }));
  return <Animated.View style={[styles.core, { borderColor: color, backgroundColor: fill }, style]} />;
}

export function ProcessingStage({ selections, onDone }: { selections: TasteSelections; onDone: () => void }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const reduced = useReducedMotion();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [line, setLine] = useState(0);
  const items = avatarsOf(selections);
  const lines = useMemo(() => statusLines(selections), [selections]);
  const total = reduced ? REDUCED_MS : TOTAL_MS;
  const bar = useSharedValue(0);
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; });

  useEffect(() => {
    let cancelled = false;
    bar.set(0);
    bar.set(withTiming(1, { duration: total, easing: Easing.inOut(Easing.quad) }));
    const tick = setInterval(() => setLine((l) => Math.min(l + 1, lines.length - 1)), Math.max(700, total / lines.length));
    void (async () => {
      // Let the first frame (and the drift) start before the blocking database write.
      await new Promise((r) => setTimeout(r, 400));
      if (cancelled) return;
      try {
        saveOnboardingTaste(selections, new Date());
      } catch {
        if (!cancelled) setError(true);
        return;
      }
      await new Promise((r) => setTimeout(r, Math.max(0, total - 400)));
      if (!cancelled) doneRef.current();
    })();
    return () => { cancelled = true; clearInterval(tick); cancelAnimation(bar); };
  }, [selections, total, attempt, lines.length, bar]);

  const barStyle = useAnimatedStyle(() => ({ width: `${bar.get() * 100}%` }));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
      <View style={styles.center}>
        {!error ? (
          <View style={styles.stage}>
            {!reduced ? <><Ring delay={0} color={c.primary} /><Ring delay={730} color={c.primary} /><Ring delay={1460} color={c.primary} /></> : null}
            {!reduced ? <Core color={c.primary} fill={c.primaryMuted} /> : <View style={[styles.core, { borderColor: c.primary, backgroundColor: c.primaryMuted }]} />}
            {!reduced ? items.map((it, i) => {
              const angle = (i / items.length) * Math.PI * 2 - Math.PI / 2;
              return <Drifter key={it.key} index={i} dx={Math.cos(angle) * RADIUS} dy={Math.sin(angle) * RADIUS} name={it.name} workId={it.workId} photo={it.photo} />;
            }) : null}
          </View>
        ) : null}
        {error ? (
          <View style={styles.msg}>
            <Text style={[styles.title, { color: c.textPrimary, fontFamily: typography.display }]}>That didn’t save.</Text>
            <Text style={[styles.copy, { color: c.textSecondary, fontFamily: typography.body }]}>Your picks are still here. Please try again.</Text>
            <Button onPress={() => { setError(false); setLine(0); setAttempt((a) => a + 1); }}>Try again</Button>
          </View>
        ) : (
          <View accessibilityLiveRegion="polite" style={styles.msg}>
            <Text style={[styles.title, { color: c.textPrimary, fontFamily: typography.display }]}>Getting to know your taste</Text>
            <Animated.Text key={line} entering={reduced ? undefined : FadeIn.duration(300)} style={[styles.copy, { color: c.textSecondary, fontFamily: typography.body }]}>{lines[line]}</Animated.Text>
            <View style={[styles.track, { backgroundColor: c.border }]}>
              <Animated.View style={[styles.fill, { backgroundColor: c.primary }, barStyle]} />
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.xl },
  stage: { width: RADIUS * 2 + AVATAR, height: RADIUS * 2 + AVATAR, alignItems: 'center', justifyContent: 'center' },
  drifter: { position: 'absolute' },
  ring: { position: 'absolute', width: CORE, height: CORE, borderRadius: CORE / 2, borderWidth: 2 },
  core: { position: 'absolute', width: CORE, height: CORE, borderRadius: CORE / 2, borderWidth: 2 },
  msg: { alignItems: 'center', gap: space.md, alignSelf: 'stretch', paddingHorizontal: space.lg },
  title: { fontSize: 26, textAlign: 'center' },
  copy: { fontSize: 16, textAlign: 'center', minHeight: 22 },
  track: { height: 4, borderRadius: 2, alignSelf: 'stretch', overflow: 'hidden', marginTop: space.sm },
  fill: { height: 4, borderRadius: 2 },
});
