import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, font, space } from './tokens';
import { Wordmark } from './primitives';
import { useAppearance } from './theme';
import { ThemeEmblem } from './ThemeEmblem';
import { Avatar } from './Avatar';
import { useProfile } from '../lib/state/settings';
import { initialOf } from '../lib/settings/profileModel';

type Tab = 'today' | 'library' | 'paths' | 'read' | 'discover';
const tabs: Array<{ id: Tab; icon: string; label: string; href: string }> = [
  { id: 'today', icon: '⌂', label: 'Today', href: '/' }, { id: 'library', icon: '▥', label: 'Library', href: '/library' },
  { id: 'paths', icon: '⌘', label: 'Paths', href: '/paths' }, { id: 'read', icon: '◫', label: 'Read now', href: '/reader' }, { id: 'discover', icon: '◈', label: 'Discover', href: '/discover' },
];
export function AppShell({ active, title, children, logo = false, right }: PropsWithChildren<{ active: Tab; title?: string; logo?: boolean; right?: React.ReactNode }>) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  // Phones with Android's three-button bar (or a gesture pill) draw it over the app: keep the tabs above it.
  const bottom = useSafeAreaInsets().bottom;
  const avatar = useProfile((p) => p.avatar); const displayName = useProfile((p) => p.displayName); const username = useProfile((p) => p.username);
  return <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]} edges={['top']}><View style={styles.header}>{logo ? <View style={styles.logoLockup}><Wordmark small /><ThemeEmblem id={theme.id} size={28} /></View> : <Text style={[styles.headerTitle, { color: c.textPrimary, fontFamily: typography.display }]}>{title}</Text>}<View style={styles.headerRight}>{right ?? <Pressable accessibilityRole="button" accessibilityLabel="Open profile" hitSlop={8} onPress={() => router.push('/profile')}><Avatar uri={avatar} initial={initialOf({ displayName, username })} size={34} /></Pressable>}</View></View><View style={styles.body}>{children}</View><View style={[styles.nav, { backgroundColor: c.surface, borderTopColor: c.border, height: 70 + bottom, paddingBottom: bottom }]}>{tabs.map((tab) => <Pressable key={tab.id} onPress={() => router.replace(tab.href as never)} style={styles.tab}><Text style={[styles.tabIcon, { color: active === tab.id ? c.navActive : c.textMuted }]}>{tab.icon}</Text><Text style={[styles.tabLabel, { color: active === tab.id ? c.navActive : c.textMuted, fontFamily: typography.bodyMedium }]}>{tab.label}</Text></Pressable>)}</View></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: color.bg }, header: { height: 62, paddingHorizontal: space.lg, alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, logoLockup: { flexDirection: 'row', alignItems: 'center', gap: 8 }, headerTitle: { color: color.text, fontSize: 26, fontFamily: font.display }, headerRight: { minWidth: 36, alignItems: 'flex-end' }, avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: color.accentDeep, borderWidth: 1, borderColor: color.accent, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: color.text, fontFamily: font.displayMedium }, body: { flex: 1 }, nav: { height: 70, backgroundColor: color.surface, borderTopColor: color.border, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 8 }, tab: { alignItems: 'center', gap: 2, width: 54 }, tabIcon: { color: color.faint, fontSize: 19 }, tabLabel: { color: color.faint, fontFamily: font.bodyMedium, fontSize: 10 }, active: { color: color.accent }, fab: { position: 'absolute', alignSelf: 'center', bottom: 43, width: 58, height: 58, borderRadius: 29, backgroundColor: color.accent, borderWidth: 5, borderColor: color.bg, alignItems: 'center', justifyContent: 'center', shadowColor: color.accent, shadowOpacity: 0.5, shadowRadius: 12, elevation: 10 }, fabIcon: { color: color.text, fontSize: 27, fontFamily: font.bodySemibold } });
