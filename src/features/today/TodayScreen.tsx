import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { COVER_ASSETS } from '../../ui/coverAssets';
import Animated, { FadeInDown, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useToday, type TodayCard } from './useToday';
import { AppShell } from '../../ui/AppShell';
import { ComicCover, coverSourceFor } from '../../ui/comic';
import { listReaderComics, type ReaderComic } from '../../lib/reader/readerLibrary';
import { progressFraction, readingNow } from '../../lib/reader/shelf';
import UpdateBanner from '../settings/UpdateBanner';
import { Button, Pill, Progress, Sheet } from '../../ui/primitives';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { radius, space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';

// id must match a key in score.ts's MOOD_GENRES (lowercase) — this was
// previously passing the capitalized label straight through as the mood id,
// which never matched MOOD_GENRES's lowercase keys, so every mood silently
// scored the same "no match" 0.3 regardless of which pill was selected.
// 'surprise' has no MOOD_GENRES entry on purpose — every candidate falls
// back to the same neutral 0.3, which is the right behavior for "don't
// steer by mood", while still being a distinct, selectable pill (unlike
// `null`, which would collide with "no mood chosen").
const moods: { id: string; label: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'mysterious', label: 'Mysterious' },
  { id: 'epic', label: 'Epic' },
  { id: 'character-driven', label: 'Character-driven' },
  { id: 'fun', label: 'Fun' },
  { id: 'emotional', label: 'Emotional' },
  { id: 'surprise', label: 'Surprise me' },
];

const HERO_H = 610;

/** The cover itself, whole and sharp, glowing over the backdrop; it settles into a smaller card as you scroll. */
function HeroArt({ source, title, scrollY, width, onPress }: { source: ReturnType<typeof coverSourceFor>; title: string; scrollY: SharedValue<number>; width: number; onPress: () => void }) {
  const cardW = Math.min(width * 0.62, 260);
  const frame = useAnimatedStyle(() => {
    const t = Math.min(1, Math.max(0, scrollY.value / (HERO_H * 0.5)));
    const w = interpolate(t, [0, 1], [cardW, 150]);
    return { width: w, height: w * 1.5, left: (width - w) / 2, transform: [{ translateY: interpolate(t, [0, 1], [18, 30]) }] };
  });
  return (
    <Animated.View style={[styles.art, styles.artGlow, frame]}>
      <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={[StyleSheet.absoluteFill, styles.artCard]}>
        {source ? <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      </Pressable>
    </Animated.View>
  );
}

/** Rows of panels, as fractions of the screen: [row height, column widths]. Uneven on purpose, like a page of comic panels. */
const PANEL_ROWS: Array<[number, number[]]> = [
  [0.15, [0.3, 0.35, 0.35]], [0.17, [0.46, 0.54]], [0.17, [0.34, 0.33, 0.33]],
  [0.17, [0.58, 0.42]], [0.17, [0.4, 0.6]], [0.17, [0.27, 0.46, 0.27]],
];
const GUTTER = 3;

/** A deterministic shuffle so the same pick always gets the same spread. */
function collageIds(leadId: string, n: number): string[] {
  const ids = Object.keys(COVER_ASSETS);
  if (!ids.length) return [];
  let h = 0; for (const ch of leadId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const out: string[] = [];
  for (let i = 0; out.length < n; i++) { h = (h * 1664525 + 1013904223) >>> 0; out.push(i % 5 === 0 ? leadId : ids[h % ids.length]); }
  return out;
}

/** A bright spread of comic panels — each a zoomed crop of a cover, lightly blurred — behind the pick, like a page of art. */
function CollageBackdrop({ workId, scrollY }: { workId: string | undefined; scrollY: SharedValue<number> }) {
  const { theme } = useAppearance(); const c = theme.colors;
  const { width, height } = useWindowDimensions();
  const count = PANEL_ROWS.reduce((n, [, cols]) => n + cols.length, 0);
  const tiles = useMemo(() => (workId ? collageIds(workId, count) : []), [workId, count]);
  const fade = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [0, HERO_H * 0.7], [1, 0.1], 'clamp'), transform: [{ translateY: -scrollY.value * 0.18 }] }));
  if (!tiles.length) return null;
  let k = 0; let y = 0;
  const panels = PANEL_ROWS.flatMap(([rh, cols]) => {
    const rowTop = y; const th = rh * height; y += th;
    let x = 0;
    return cols.map((cw) => {
      const i = k++; const tw = cw * width; const left = x; x += tw;
      const src = coverSourceFor(tiles[i]);
      const z = 1.7 + ((i * 7) % 5) * 0.15; const ox = ((i * 37) % 70) / 100; const oy = ((i * 53) % 80) / 100;
      return (
        <View key={`${tiles[i]}-${i}`} style={{ position: 'absolute', left: left + GUTTER / 2, top: rowTop + GUTTER / 2, width: tw - GUTTER, height: th - GUTTER, overflow: 'hidden', borderRadius: 2 }}>
          {src ? <Image source={src} blurRadius={3} contentFit="cover" style={{ position: 'absolute', width: tw * z, height: tw * z * 1.5, left: -(tw * z - tw) * ox, top: -(tw * z * 1.5 - th) * oy }} /> : null}
        </View>
      );
    });
  });
  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#9A9A9E' }, fade]}>{panels}
        {/* lifts any near-black crop to a warm tone, so no panel reads as a hole */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#7A6458', mixBlendMode: 'screen' }]} />
      </Animated.View>
      {/* keep the header and the lower text readable; the middle stays bright */}
      <LinearGradient colors={[`${c.background}CC`, `${c.background}00`, `${c.background}1A`, `${c.background}D0`, c.background]} locations={[0, 0.15, 0.42, 0.7, 0.9]} style={StyleSheet.absoluteFill} />
    </>
  );
}

/** A small cover card for the "more picks" and "continue reading" strips. */
function StripCard({ label, title, workId, onPress, progress, uri }: { label?: string; title: string; workId?: string; onPress: () => void; progress?: number; uri?: string | null }) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.stripCard, pressed && { opacity: 0.85 }]}>
    {uri ? <View style={[styles.stripCover, { backgroundColor: c.surfaceRaised }]}><Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={uri} /></View> : <ComicCover title={title} workId={workId} size="grid" />}
    {label ? <Text style={[styles.stripLabel, { color: c.primary, fontFamily: typography.bodySemibold }]}>{label.toUpperCase()}</Text> : null}
    <Text numberOfLines={2} style={[styles.stripTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{title}</Text>
    {progress !== undefined ? <Progress value={progress} /> : null}
  </Pressable>;
}

export default function TodayScreen() {
  const today = useToday(); const [showWhy, setShowWhy] = useState(false); const [showNotTonight, setShowNotTonight] = useState(false);
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const [reading, setReading] = useState<ReaderComic[]>([]);
  useFocusEffect(useCallback(() => { setReading(readingNow(listReaderComics()).slice(0, 8)); }, []));
  const lead = (today.lead === 'continue' ? today.continueCard : today.lead === 'switch' ? today.switchCard : today.exploreCard) ?? today.continueCard ?? today.switchCard ?? today.exploreCard;
  const others = [today.continueCard, today.switchCard, today.exploreCard].filter((card): card is NonNullable<typeof card> => !!card && card.workId !== lead?.workId);
  const backdrop = coverSourceFor(lead?.workId);
  const travel = today.formatFilter === 'digital';
  const { width } = useWindowDimensions();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y; });
  return <AppShell active="today" logo bleed={<CollageBackdrop workId={lead?.workId} scrollY={scrollY} />}><Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <Animated.View entering={FadeInDown.duration(420)}>
    {lead ? (
      <View style={[styles.heroWrap, { height: HERO_H }]}>
        <HeroArt source={backdrop} title={lead.title} scrollY={scrollY} width={width} onPress={() => router.push(`/comic/${lead.workId}`)} />
        <View pointerEvents="box-none" style={styles.heroText}>
          <Text style={[styles.eyebrow, { color: c.textSecondary, fontFamily: typography.bodySemibold }]}>TONIGHT&apos;S PICK · {lead.bucket.replaceAll('_', ' ').toUpperCase()}</Text>
          <Text numberOfLines={2} style={[styles.heroTitle, { color: c.textPrimary, fontFamily: typography.display }]}>{lead.title}</Text>
          <Text numberOfLines={2} style={[styles.reason, { color: c.textSecondary, fontFamily: typography.body }]}>{lead.inLibrary ? 'In your library' : 'New to you'} · {lead.reasons[0] ?? 'A clear next step in your reading.'}</Text>
          <View style={styles.cta}><Button onPress={() => router.push(`/comic/${lead.workId}`)}>Read tonight  →</Button></View>
          <Pressable onPress={() => setShowWhy(true)} hitSlop={8} style={styles.why}><Text style={[styles.whyText, { color: c.textSecondary, fontFamily: typography.bodySemibold }]}>Why this?</Text></Pressable>
        </View>
      </View>
    ) : (
      <View style={[styles.noPick, { backgroundColor: c.surface, borderColor: c.border }]}><Text style={[styles.noPickTitle, { color: c.textPrimary, fontFamily: typography.display }]}>Your next read is waiting.</Text><Text style={[styles.noPickCopy, { color: c.textSecondary, fontFamily: typography.body }]}>Add a few comics to your library, then ComicPill can make a considered pick.</Text><Button onPress={() => router.push('/library')}>Build my library</Button></View>
    )}

    </Animated.View>

    <Animated.View entering={FadeInDown.delay(90).duration(420)}>
    <Text style={[styles.sectionLabel, { color: c.textMuted, fontFamily: typography.bodySemibold }]}>IN THE MOOD FOR</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
      <Pill label={travel ? '✈ Digital only' : '✈ Travel'} active={travel} onPress={() => today.setFormatFilter(travel ? 'any' : 'digital')} />
      {moods.map((mood) => <Pill key={mood.id} label={mood.label} active={today.mood === mood.id} onPress={() => today.setMood(today.mood === mood.id ? null : mood.id)} />)}
    </ScrollView>

    </Animated.View>

    <Animated.View entering={FadeInDown.delay(180).duration(420)}>
    {reading.length ? <>
      <Text style={[styles.section, { color: c.textPrimary, fontFamily: typography.display }]}>Continue reading</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {reading.map((comic) => <StripCard key={comic.id} title={comic.title} uri={comic.coverPath} progress={progressFraction(comic)} onPress={() => router.push(`/reader/${comic.id}`)} />)}
      </ScrollView>
    </> : null}

    {others.length ? <>
      <Text style={[styles.section, { color: c.textPrimary, fontFamily: typography.display }]}>More good picks</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {others.map((card) => <StripCard key={card.workId} label={card === today.continueCard ? 'Continue' : card === today.switchCard ? 'Switch it up' : 'Explore'} title={card.title} workId={card.workId} onPress={() => router.push(`/comic/${card.workId}`)} />)}
      </ScrollView>
    </> : null}
      <PressableScale to={0.98} onPress={() => router.push('/paths')} style={[styles.pathsCard, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={[styles.pathsIcon, { backgroundColor: c.primaryMuted }]}><Icon name="git-network" size={22} color={c.primary} /></View>
        <View style={{ flex: 1 }}><Text style={[styles.pathsTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>Reading paths</Text><Text style={[styles.pathsSub, { color: c.textSecondary, fontFamily: typography.body }]}>What to read before or after anything.</Text></View>
        <Icon name="chevron-forward" size={18} color={c.textMuted} />
      </PressableScale>
    </Animated.View>
  </Animated.ScrollView>
  {showWhy && lead ? <View style={[styles.overlay, { backgroundColor: c.overlay }]}><Sheet title="Why this tonight?" onClose={() => setShowWhy(false)}><Text style={[styles.sheetLead, { color: c.textSecondary, fontFamily: typography.body }]}>A few reasons it earns tonight.</Text>{(lead.reasons.length ? lead.reasons : ['It fits your current reading mood.', 'It is a natural next step in your library.', 'It is short enough to enjoy tonight.']).slice(0, 3).map((reason) => <View key={reason} style={styles.reasonRow}><Text style={[styles.reasonDot, { color: c.primary }]}>✦</Text><Text style={[styles.reasonText, { color: c.textPrimary, fontFamily: typography.body }]}>{reason}</Text></View>)}<Button kind="destructive" onPress={() => { setShowWhy(false); setShowNotTonight(true); }}>Not tonight</Button><Button kind="ghost" onPress={() => setShowWhy(false)}>Close</Button></Sheet></View> : null}
  {showNotTonight && lead ? <View style={[styles.overlay, { backgroundColor: c.overlay }]}><Sheet><Text style={[styles.notTitle, { color: c.textPrimary, fontFamily: typography.display }]}>Not tonight?</Text><Text style={[styles.notCopy, { color: c.textSecondary, fontFamily: typography.body }]}>No problem. We’ll adjust and find something else when you’re ready.</Text><Button onPress={() => { today.notTonight(lead.workId); setShowNotTonight(false); }}>Find another pick</Button><Button kind="secondary" style={{ marginTop: 10 }} onPress={() => setShowNotTonight(false)}>Keep current pick</Button></Sheet></View> : null}
  </AppShell>;
}
const styles = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.sm, paddingBottom: 110 },
  heroWrap: { marginHorizontal: -space.lg, marginTop: -space.sm },
  art: { position: 'absolute', top: 0 },
  artGlow: { borderRadius: 20, backgroundColor: '#111', boxShadow: '0 0 46px 14px rgba(255, 196, 120, 0.55), 0 18px 34px rgba(0, 0, 0, 0.55)' },
  artCard: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#FFFFFF2E', backgroundColor: '#111' },
  heroText: { position: 'absolute', left: space.lg, right: space.lg, bottom: 0, alignItems: 'center' },
  hero: { borderRadius: 28, borderWidth: 1, overflow: 'hidden', paddingTop: 30, paddingBottom: space.lg, paddingHorizontal: space.lg, alignItems: 'center' },
  fan: { height: 214, width: '100%', alignItems: 'center', justifyContent: 'center', marginBottom: space.lg },
  fanCover: { position: 'absolute' },
  eyebrow: { fontSize: 10, letterSpacing: 1.6, textAlign: 'center' },
  heroTitle: { fontSize: 28, lineHeight: 33, textAlign: 'center', marginTop: 8 },
  reason: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8, maxWidth: 300 },
  cta: { alignSelf: 'stretch', marginTop: space.lg },
  why: { paddingTop: 14, paddingBottom: 2 },
  whyText: { fontSize: 13 },
  sectionLabel: { fontSize: 10, letterSpacing: 1.6, marginTop: 26, marginBottom: 2 },
  pills: { gap: 8, paddingVertical: 10 },
  section: { fontSize: 22, marginTop: 22, marginBottom: 12 },
  strip: { gap: 14, paddingRight: space.lg },
  pathsCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, marginTop: 28 },
  pathsIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  pathsTitle: { fontSize: 16 },
  pathsSub: { fontSize: 13, marginTop: 2 },
  stripCard: { width: 110, gap: 6 },
  stripCover: { width: 96, height: 144, borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: '#ffffff20' },
  stripLabel: { fontSize: 9, letterSpacing: 1.2, marginTop: 2 },
  stripTitle: { fontSize: 12, lineHeight: 15 },
  overlay: { ...StyleSheet.absoluteFill, zIndex: 10, justifyContent: 'flex-end', backgroundColor: '#000000aa' },
  sheetLead: { fontSize: 15, marginBottom: 12 },
  reasonRow: { flexDirection: 'row', gap: 10, paddingVertical: 10 },
  reasonDot: { fontSize: 17 },
  reasonText: { flex: 1, fontSize: 15, lineHeight: 22 },
  notTitle: { fontSize: 30 },
  notCopy: { fontSize: 15, lineHeight: 23, marginVertical: 14 },
  noPick: { padding: 24, borderRadius: radius.lg, borderWidth: 1, gap: 10 },
  noPickTitle: { fontSize: 24 },
  noPickCopy: { fontSize: 15, lineHeight: 22 },
});
