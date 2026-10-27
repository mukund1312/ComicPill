import { useEffect, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, usePathname } from 'expo-router';
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

type SideRow = { icon: IconName; label: string; sub?: string; href: string; tab?: Exclude<Tab, 'none'> };
const SIDE_MAIN: SideRow[] = [
  { icon: 'home-outline', label: 'Today', href: '/', tab: 'today' },
  { icon: 'book-outline', label: 'Reading Now', href: '/reader', tab: 'reading' },
  { icon: 'search-outline', label: 'Search', href: '/search', tab: 'search' },
  { icon: 'storefront-outline', label: 'Discover', href: '/discover', tab: 'discover' },
];
const SIDE_LIBRARIES: SideRow[] = [
  { icon: 'phone-landscape-outline', label: 'On My Tablet', href: '/reader/phone' },
  { icon: 'albums-outline', label: 'My Collection', href: '/collection' },
  { icon: 'folder-open-outline', label: 'Collections', href: '/reader/collections' },
];
const SIDE_IMPORT: SideRow[] = [
  { icon: 'document-outline', label: 'Import from Files', href: '/library' },
  { icon: 'server-outline', label: 'Connect a Server', href: '/reader/opds' },
  { icon: 'scan-outline', label: 'Scan a Comic', href: '/scan' },
];

/** The iPad-style sidebar: the main places up top, then your libraries and the ways to bring comics in. */
function Sidebar({ active }: { active: Tab }) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const top = useSafeAreaInsets().top; const bottom = useSafeAreaInsets().bottom;
  const avatar = useProfile((p) => p.avatar); const displayName = useProfile((p) => p.displayName); const username = useProfile((p) => p.username);
  const path = usePathname();
  const row = (r: SideRow, i: number, last: boolean) => {
    // Highlight by where you actually are, so a library inside the Library tab lights up on its own row.
    const on = r.label === 'Import from Files' || r.label === 'Connect a Server' || r.label === 'Scan a Comic' ? false : path === r.href;
    return (
      <Pressable key={r.label} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => { feedback.select(); router.replace(r.href as never); }}
        style={[styles.sideRow, on && { backgroundColor: c.primaryMuted }, !last && !on && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <Icon name={r.icon} size={22} color={on ? c.primary : c.textSecondary} />
        <Text numberOfLines={1} style={[styles.sideLabel, { color: on ? c.primary : c.textPrimary, fontFamily: on ? typography.bodySemibold : typography.bodyMedium }]}>{r.label}</Text>
      </Pressable>
    );
  };
  const group = (title: string | null, rows: SideRow[]) => (
    <View style={{ marginTop: title ? 22 : 8 }}>
      {title ? <Text style={[styles.sideHead, { color: c.textPrimary, fontFamily: typography.display }]}>{title}</Text> : null}
      <View style={[styles.sideCard, { backgroundColor: c.surfaceRaised }]}>{rows.map((r, i) => row(r, i, i === rows.length - 1))}</View>
    </View>
  );
  return (
    <View style={[styles.side, { backgroundColor: c.surface, borderRightColor: c.border, paddingTop: top + 14, paddingBottom: bottom + 14 }]}>
      <View style={styles.sideTop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => router.push('/profile')}><Avatar uri={avatar} initial={initialOf({ displayName, username })} size={40} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" hitSlop={8} onPress={() => router.push('/settings')} style={[styles.sideBtn, { backgroundColor: c.surfaceRaised }]}><Icon name="settings-outline" size={20} color={c.textPrimary} /></Pressable>
      </View>
      <Text style={[styles.sideTitle, { color: c.textPrimary, fontFamily: typography.display }]}>Menu</Text>
      <ScrollView showsVerticalScrollIndicator={false}>
        {group(null, SIDE_MAIN)}
        {group('Libraries', SIDE_LIBRARIES)}
        {group('Import Services', SIDE_IMPORT)}
        {group(null, [{ icon: 'library-outline', label: 'Library hub', href: '/library', tab: 'library' }])}
      </ScrollView>
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
      {layout.rail ? <Sidebar active={active} /> : null}
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
          <View style={styles.headerRight}>{right ?? (layout.rail ? null : <Pressable accessibilityRole="button" accessibilityLabel="Open profile" hitSlop={8} onPress={() => router.push('/profile')}><Avatar uri={avatar} initial={initialOf({ displayName, username })} size={38} /></Pressable>)}</View>
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
  side: { width: RAIL_WIDTH, borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14 },
  sideTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  sideBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  sideTitle: { fontSize: 34, letterSpacing: -1, marginTop: 14, paddingHorizontal: 6 },
  sideHead: { fontSize: 20, letterSpacing: -0.3, marginBottom: 8, paddingHorizontal: 6 },
  sideCard: { borderRadius: 18, overflow: 'hidden' },
  sideRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, minHeight: 50 },
  sideLabel: { fontSize: 16, flex: 1 },
  barWrap: { paddingHorizontal: BAR_MARGIN, paddingTop: 6 },
  bar: { height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', paddingHorizontal: BAR_PAD, shadowOpacity: 0.55, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 16 },
  highlight: { position: 'absolute', left: BAR_PAD, top: 6, bottom: 6, borderRadius: (BAR_HEIGHT - 12) / 2 },
  tab: { height: BAR_HEIGHT - 12, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabLabel: { fontSize: 10.5, letterSpacing: 0.1 },
});
