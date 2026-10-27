import { useEffect, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { Easing, FadeIn, interpolate, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from './tokens';
import { Wordmark } from './primitives';
import { HeaderButton, Icon, type IconName } from './Icon';
import { useAppearance } from './theme';
import { ThemeEmblem } from './ThemeEmblem';
import { Avatar } from './Avatar';
import { feedback } from '../lib/platform/feedback';
import { useProfile } from '../lib/state/settings';
import { initialOf } from '../lib/settings/profileModel';
import { RAIL_WIDTH, useLayout } from './layout';

type Tab = 'today' | 'reading' | 'library' | 'discover' | 'search' | 'none';
const tabs: Array<{ id: Exclude<Tab, 'none'>; icon: IconName; iconActive: IconName; label: string; href: string }> = [
  { id: 'today', icon: 'home-outline', iconActive: 'home', label: 'Today', href: '/' },
  { id: 'reading', icon: 'book-outline', iconActive: 'book', label: 'Reading', href: '/reader' },
  { id: 'library', icon: 'layers-outline', iconActive: 'layers', label: 'Library', href: '/library' },
  { id: 'discover', icon: 'storefront-outline', iconActive: 'storefront', label: 'Discover', href: '/discover' },
  { id: 'search', icon: 'search-outline', iconActive: 'search', label: 'Search', href: '/search' },
];

// Each tab is its own screen, so the highlight remembers where it was and glides from there to the new tab.
let lastTabIndex = 0;
const BAR_MARGIN = 14; const BAR_PAD = 6; const BAR_HEIGHT = 66;

function TabBar({ active }: { active: Tab }) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const layout = useLayout(); const bottom = useSafeAreaInsets().bottom;
  const width = Math.min(layout.width, 560); // on a tablet the floating bar stays a comfortable size instead of stretching across
  const index = tabs.findIndex((t) => t.id === active);
  const tabWidth = (width - BAR_MARGIN * 2 - BAR_PAD * 2) / tabs.length;
  const x = useSharedValue(lastTabIndex * tabWidth);
  const bump = useSharedValue(0);
  useEffect(() => {
    if (index < 0) return; // a page that belongs to no tab leaves the highlight where it was, hidden
    x.value = withSpring(index * tabWidth, { damping: 20, stiffness: 240, mass: 0.7 });
    bump.value = 0; bump.value = withSpring(1, { damping: 9, stiffness: 220 });
    lastTabIndex = index;
  }, [index, tabWidth, x, bump]);
  const highlight = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.82 + 0.18 * bump.value }] }));
  return (
    <View pointerEvents="box-none" style={[styles.barWrap, { paddingBottom: Math.max(bottom, 10) + 4, alignItems: 'center' }]}>
      <View style={[styles.bar, { width: width - BAR_MARGIN * 2 }, { backgroundColor: `${c.surface}F7`, borderColor: c.border, shadowColor: c.shadow }]}>
        {index >= 0 ? <Animated.View pointerEvents="none" style={[styles.highlight, { width: tabWidth, backgroundColor: c.primaryMuted }, highlight]} /> : null}
        {tabs.map((tab) => {
          const on = tab.id === active;
          return (
            <Pressable key={tab.id} accessibilityRole="button" accessibilityLabel={tab.label} accessibilityState={{ selected: on }}
              onPress={() => { if (!on) { feedback.select(); router.replace(tab.href as never); } }} style={[styles.tab, { width: tabWidth }]}>
              <Animated.View style={on ? iconStyle : undefined}><Icon name={on ? tab.iconActive : tab.icon} size={22} color={on ? c.primary : c.textMuted} /></Animated.View>
              <Text numberOfLines={1} style={[styles.tabLabel, { color: on ? c.primary : c.textMuted, fontFamily: on ? typography.bodySemibold : typography.bodyMedium }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The tabs as a slim vertical rail, for screens wide enough that a bottom bar would be a long way from the thumb. */
function TabRail({ active }: { active: Tab }) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const top = useSafeAreaInsets().top; const bottom = useSafeAreaInsets().bottom;
  return (
    <View style={[styles.rail, { backgroundColor: c.surface, borderRightColor: c.border, paddingTop: top + 18, paddingBottom: bottom + 16 }]}>
      <View style={styles.railMark}><Icon name="book" size={22} color={c.primary} /></View>
      {tabs.map((tab) => {
        const on = tab.id === active;
        return (
          <Pressable key={tab.id} accessibilityRole="button" accessibilityLabel={tab.label} accessibilityState={{ selected: on }}
            onPress={() => { if (!on) { feedback.select(); router.replace(tab.href as never); } }} style={styles.railTab}>
            <View style={[styles.railPill, on && { backgroundColor: c.primaryMuted }]}><Icon name={on ? tab.iconActive : tab.icon} size={22} color={on ? c.primary : c.textMuted} /></View>
            <Text numberOfLines={1} style={[styles.tabLabel, { color: on ? c.primary : c.textMuted, fontFamily: on ? typography.bodySemibold : typography.bodyMedium }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function AppShell({ active, title, children, logo = false, right, back = false, bleed, scrollY }: PropsWithChildren<{ active: Tab; title?: string; logo?: boolean; right?: ReactNode; back?: boolean; bleed?: ReactNode; scrollY?: SharedValue<number> }>) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const layout = useLayout(); const insetTop = useSafeAreaInsets().top;
  // As the page scrolls the wordmark rises a little and shrinks, and the avatar follows.
  const fallback = useSharedValue(0); const sy = scrollY ?? fallback;
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(sy.value, [0, 140], [0, -7], 'clamp') }, { scale: interpolate(sy.value, [0, 140], [1, 0.8], 'clamp') }] }));
  const avatar = useProfile((p) => p.avatar); const displayName = useProfile((p) => p.displayName); const username = useProfile((p) => p.username);
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background, flexDirection: layout.rail ? 'row' : 'column' }]} edges={layout.rail ? [] : ['top']}>
      {layout.rail ? <TabRail active={active} /> : null}
      <View style={[styles.main, { paddingTop: layout.rail ? insetTop : 0 }]}>
      {/* artwork that bleeds across the whole screen, behind the header and the tab bar */}
      {bleed ? <View pointerEvents="none" style={StyleSheet.absoluteFill}>{bleed}</View> : null}
      <View style={[styles.column, { maxWidth: layout.maxContent }]}>
      {back ? (
        <>
          <View style={styles.topBar}>
            <HeaderButton icon="chevron-back" label="Back" onPress={() => router.back()} />
            <View style={styles.headerRight}>{right}</View>
          </View>
          <Text accessibilityRole="header" numberOfLines={1} style={[styles.pageTitle, { color: c.textPrimary, fontFamily: typography.display }]}>{title}</Text>
        </>
      ) : (
        <View style={styles.header}>
          {logo ? <Animated.View style={[styles.logoLockup, logoStyle, { transformOrigin: 'left center' }]}><Wordmark small /><ThemeEmblem id={theme.id} size={26} /></Animated.View> : <Text accessibilityRole="header" style={[styles.headerTitle, { color: c.textPrimary, fontFamily: typography.display }]}>{title}</Text>}
          <View style={styles.headerRight}>{right ?? <Pressable accessibilityRole="button" accessibilityLabel="Open profile" hitSlop={8} onPress={() => router.push('/profile')}><Avatar uri={avatar} initial={initialOf({ displayName, username })} size={38} /></Pressable>}</View>
        </View>
      )}
      {/* The same gentle rise on every tab, so moving around the app always feels the same. */}
      <Animated.View key={active} entering={FadeIn.duration(260).easing(Easing.out(Easing.cubic))} style={styles.body}>{children}</Animated.View>
      </View>
      {layout.rail ? null : <TabBar active={active} />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { minHeight: 68, paddingHorizontal: space.lg, paddingTop: 6, alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  topBar: { minHeight: 56, paddingHorizontal: space.lg, paddingTop: 6, alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  pageTitle: { fontSize: 34, letterSpacing: -1, paddingHorizontal: space.lg, marginTop: 8, marginBottom: 6 },
  logoLockup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 34, letterSpacing: -1 },
  headerRight: { minWidth: 38, alignItems: 'flex-end' },
  body: { flex: 1 },
  main: { flex: 1 },
  column: { flex: 1, width: '100%', alignSelf: 'center' },
  rail: { width: RAIL_WIDTH, borderRightWidth: StyleSheet.hairlineWidth, alignItems: 'center', gap: 6 },
  railMark: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  railTab: { width: RAIL_WIDTH, alignItems: 'center', gap: 4, paddingVertical: 8 },
  railPill: { width: 56, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  barWrap: { paddingHorizontal: BAR_MARGIN, paddingTop: 6 },
  bar: { height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', paddingHorizontal: BAR_PAD, shadowOpacity: 0.55, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 16 },
  highlight: { position: 'absolute', left: BAR_PAD, top: 6, bottom: 6, borderRadius: (BAR_HEIGHT - 12) / 2 },
  tab: { height: BAR_HEIGHT - 12, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabLabel: { fontSize: 10.5, letterSpacing: 0.1 },
});
