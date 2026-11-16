// Reading lists: one place for every "list of comics in order" ComicPill has. Your own lists (playlists), reading paths (journeys around a
// character or event) and reading orders (what to read first) used to be three separate places reached from different screens.
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AppShell } from '../../ui/AppShell';
import { Icon, type IconName } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { useAppearance } from '../../ui/theme';
import { space } from '../../ui/tokens';

type Kind = { icon: IconName; title: string; copy: string; href: string };
const KINDS: Kind[] = [
  { icon: 'list', title: 'My lists', copy: 'Lists you make, in the order you want to read them. Share one with a code.', href: '/playlists' },
  { icon: 'git-network', title: 'Reading paths', copy: 'Journeys around a character or an event, with your progress along the way.', href: '/paths' },
  { icon: 'map', title: 'Reading orders', copy: 'What to read first, for the big runs and crossovers.', href: '/reading-orders' },
];

export default function ReadingListsScreen() {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  return (
    <AppShell active="library" back title="Reading lists">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: c.textSecondary, fontFamily: typography.body }]}>Everything you read in order, in one place.</Text>
        {KINDS.map((k, i) => (
          <Animated.View key={k.href} entering={FadeInDown.delay(i * 60).duration(320)}>
            <PressableScale to={0.985} onPress={() => router.push(k.href as never)} style={[styles.card, { backgroundColor: c.surface }]} accessibilityRole="button" accessibilityLabel={k.title}>
              <View style={[styles.icon, { backgroundColor: c.surfaceRaised }]}><Icon name={k.icon} size={22} color={c.textPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{k.title}</Text>
                <Text style={[styles.copy, { color: c.textSecondary, fontFamily: typography.body }]}>{k.copy}</Text>
              </View>
              <Icon name="chevron-forward" size={18} color={c.textMuted} />
            </PressableScale>
          </Animated.View>
        ))}
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: 130 },
  intro: { fontSize: 16, lineHeight: 23, marginTop: space.xs, marginBottom: space.xl },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.lg, borderRadius: 20, padding: space.lg, marginBottom: space.md },
  icon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18 },
  copy: { fontSize: 14, lineHeight: 20, marginTop: 4 },
});
