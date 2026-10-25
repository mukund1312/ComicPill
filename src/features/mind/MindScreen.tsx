import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import DigestTab from './DigestTab';
import InboxTab from './InboxTab';
import LibraryTab from './LibraryTab';
import TasteTab from './TasteTab';
import { useMindData } from './useMindData';
import { ratedCount } from '../../lib/mind/queries';
import { useMindSettings } from '../../lib/mind/settings';
import { AppShell } from '../../ui/AppShell';
import { Pill } from '../../ui/primitives';
import { color, font, radius, space, type } from '../../ui/tokens';

type Tab = 'digest' | 'inbox' | 'library' | 'taste';

export default function MindScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>((['digest', 'inbox', 'library', 'taste'] as const).find((t) => t === params.tab) ?? 'digest');
  const data = useMindData();
  const settings = useMindSettings();
  const waiting = data.shots.filter((s) => s.status === 'awaiting_approval' || s.status === 'needs_review').length;
  const needsQuiz = !settings.quizDone && ratedCount() < 10;

  return (
    <AppShell active="library" title="Mind Space" right={<Pressable accessibilityRole="button" accessibilityLabel="Mind Space settings" onPress={() => router.push('/mind/settings')}><Text style={styles.gear}>⚙</Text></Pressable>}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
          <Pill label="Digest" active={tab === 'digest'} onPress={() => setTab('digest')} />
          <Pill label={waiting ? `Inbox · ${waiting}` : 'Inbox'} active={tab === 'inbox'} onPress={() => setTab('inbox')} />
          <Pill label="Library" active={tab === 'library'} onPress={() => setTab('library')} />
          <Pill label="Taste" active={tab === 'taste'} onPress={() => setTab('taste')} />
        </ScrollView>
        {needsQuiz ? (
          <Pressable style={styles.banner} onPress={() => router.push('/mind/quiz')}>
            <Text style={styles.bannerTitle}>Teach it your taste</Text>
            <Text style={styles.bannerBody}>Rate 15 comics you’ve read so scores aren’t blind. Takes two minutes.</Text>
          </Pressable>
        ) : null}
        {tab === 'digest' ? <DigestTab data={data} refresh={data.refresh} /> : null}
        {tab === 'inbox' ? <InboxTab data={data} refresh={data.refresh} /> : null}
        {tab === 'library' ? <LibraryTab data={data} /> : null}
        {tab === 'taste' ? <TasteTab data={data} /> : null}
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 120, gap: space.md },
  pills: { gap: 8 },
  gear: { color: color.text, fontSize: 24 },
  banner: { backgroundColor: color.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: color.accent, padding: space.md, gap: 2 },
  bannerTitle: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle },
  bannerBody: { color: color.muted, fontFamily: font.body, fontSize: type.caption },
});
