import { useEffect, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from './tokens';
import { Wordmark } from './primitives';
import { Icon, type IconName } from './Icon';
import { useAppearance } from './theme';
import { ThemeEmblem } from './ThemeEmblem';
import { Avatar } from './Avatar';
import { feedback } from '../lib/platform/feedback';
import { useProfile } from '../lib/state/settings';
import { initialOf } from '../lib/settings/profileModel';

type Tab = 'today' | 'library' | 'paths' | 'read' | 'discover' | 'none';
const tabs: Array<{ id: Exclude<Tab, 'none'>; icon: IconName; iconActive: IconName; label: string; href: string }> = [
  { id: 'today', icon: 'home-outline', iconActive: 'home', label: 'Today', href: '/' },
  { id: 'library', icon: 'library-outline', iconActive: 'library', label: 'Library', href: '/library' },
  { id: 'paths', icon: 'git-network-outline', iconActive: 'git-network', label: 'Paths', href: '/paths' },
  { id: 'read', icon: 'book-outline', iconActive: 'book', label: 'Read now', href: '/reader' },
  { id: 'discover', icon: 'compass-outline', iconActive: 'compass', label: 'Discover', href: '/discover' },
];

// Each tab is its own screen, so the highlight remembers where it was and glides from there to the new tab.
let lastTabIndex = 0;
const BAR_MARGIN = 14; const BAR_PAD = 6; const BAR_HEIGHT = 66;

function TabBar({ active }: { active: Tab }) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const { width } = useWindowDimensions(); const bottom = useSafeAreaInsets().bottom;
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
    <View pointerEvents="box-none" style={[styles.barWrap, { paddingBottom: Math.max(bottom, 10) + 4 }]}>
      <View style={[styles.bar, { backgroundColor: `${c.surface}F7`, borderColor: c.border, shadowColor: c.shadow }]}>
        {index >= 0 ? <Animated.View pointerEvents="none" style={[styles.highlight, { width: tabWidth, backgroundColor: c.primaryMuted }, highlight]} /> : null}
        {tabs.map((tab) => {
          const on = tab.id === active;
          return (
            <Pressable key={tab.id} accessibilityRole="button" accessibilityLabel={tab.label} accessibilityState={{ selected: on }}
              onPress={() => { if (!on) { feedback.select(); router.replace(tab.href as never); } }} style={[styles.tab, { width: tabWidth }]}>
              <Animated.View style={on ? iconStyle : undefined}><Icon name={on ? tab.iconActive : tab.icon} size={22} color={on ? c.primary : c.textMuted} /></Animated.View>
              <Text style={[styles.tabLabel, { color: on ? c.primary : c.textMuted, fontFamily: on ? typography.bodySemibold : typography.bodyMedium }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function AppShell({ active, title, children, logo = false, right }: PropsWithChildren<{ active: Tab; title?: string; logo?: boolean; right?: ReactNode }>) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const avatar = useProfile((p) => p.avatar); const displayName = useProfile((p) => p.displayName); const username = useProfile((p) => p.username);
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]} edges={['top']}>
      <View style={styles.header}>
        {logo ? <View style={styles.logoLockup}><Wordmark small /><ThemeEmblem id={theme.id} size={26} /></View> : <Text accessibilityRole="header" style={[styles.headerTitle, { color: c.textPrimary, fontFamily: typography.display }]}>{title}</Text>}
        <View style={styles.headerRight}>{right ?? <Pressable accessibilityRole="button" accessibilityLabel="Open profile" hitSlop={8} onPress={() => router.push('/profile')}><Avatar uri={avatar} initial={initialOf({ displayName, username })} size={38} /></Pressable>}</View>
      </View>
      {/* The same gentle rise on every tab, so moving around the app always feels the same. */}
      <Animated.View key={active} entering={FadeIn.duration(260).easing(Easing.out(Easing.cubic))} style={styles.body}>{children}</Animated.View>
      <TabBar active={active} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { minHeight: 68, paddingHorizontal: space.lg, paddingTop: 6, alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  logoLockup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 34, letterSpacing: -1 },
  headerRight: { minWidth: 38, alignItems: 'flex-end' },
  body: { flex: 1 },
  barWrap: { paddingHorizontal: BAR_MARGIN, paddingTop: 6 },
  bar: { height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', paddingHorizontal: BAR_PAD, shadowOpacity: 0.55, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 16 },
  highlight: { position: 'absolute', left: BAR_PAD, top: 6, bottom: 6, borderRadius: (BAR_HEIGHT - 12) / 2 },
  tab: { height: BAR_HEIGHT - 12, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabLabel: { fontSize: 10.5, letterSpacing: 0.1 },
});
