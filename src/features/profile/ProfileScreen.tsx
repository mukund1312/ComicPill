// Profile: who you are as a reader, from your own data. Name, bio and photo
// come from Edit profile; the persona, taste bars, monthly goal and journal
// are derived from your actual library and history — never sample values.
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AppShell } from '../../ui/AppShell';
import { Avatar } from '../../ui/Avatar';
import { Button, Eyebrow, Progress, SectionHeader } from '../../ui/primitives';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { useProfile } from '../../lib/state/settings';
import { initialOf } from '../../lib/settings/profileModel';
import { historyLine, monthProgress, personaFor, tasteBars } from '../../lib/settings/profileStats';
import { loadHistory } from '../../lib/db/queries/profileData';
import { getProfile } from '../../lib/db/queries/profile';
import { dataSummary } from '../../lib/db/queries/userData';
import { useOnboarding } from '../../lib/state/onboarding';
import { summarizeTaste } from '../../lib/onboarding/taste';

const COLLAPSED_BARS = 4;
const EXPANDED_BARS = 10;

export default function ProfileScreen() {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const name = useProfile((p) => p.displayName);
  const username = useProfile((p) => p.username);
  const bio = useProfile((p) => p.bio);
  const avatar = useProfile((p) => p.avatar);
  const goal = useProfile((p) => p.monthlyGoal);

  const [tick, setTick] = useState(0);
  const [allTaste, setAllTaste] = useState(false);
  useFocusEffect(useCallback(() => { setTick((t) => t + 1); }, []));

  const data = useMemo(() => {
    const now = new Date();
    const history = loadHistory();
    const taste = getProfile(now);
    const summary = dataSummary();
    const finishedAt = history.filter((h) => h.status === 'done').map((h) => h.finishedAt);
    return {
      now, history, summary,
      persona: personaFor(taste, summary.finished),
      bars: tasteBars(taste, EXPANDED_BARS),
      month: monthProgress(finishedAt, goal, now),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, goal]);

  const bars = allTaste ? data.bars : data.bars.slice(0, COLLAPSED_BARS);
  const recent = data.history.slice(0, 3);

  return (
    <AppShell active="none" title="Profile" right={<View />}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* identity */}
        <View style={styles.identity}>
          <Avatar uri={avatar} initial={initialOf({ displayName: name, username })} />
          <Text style={[styles.name, { color: c.textPrimary, fontFamily: typography.display }]}>{name}</Text>
          <Text style={[styles.handle, { color: c.textMuted, fontFamily: typography.bodyMedium }]}>@{username}</Text>
          {bio ? <Text style={[styles.bio, { color: c.textSecondary, fontFamily: typography.body }]}>{bio}</Text> : null}
          <View style={styles.actions}>
            <Button kind="secondary" style={styles.flex} onPress={() => router.push('/edit-profile')}>Edit profile</Button>
            <Button kind="secondary" style={styles.flex} onPress={() => router.push('/settings')}>Settings</Button>
          </View>
        </View>

        {/* stats */}
        <View style={styles.stats}>
          <Stat n={data.summary.inLibrary} label="In library" />
          <Stat n={data.summary.finished} label="Finished" />
          <Stat n={data.summary.reading} label="Reading" />
        </View>

        {/* persona */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Eyebrow>Your reading persona</Eyebrow>
          <Text style={[styles.persona, { color: c.primary, fontFamily: typography.display }]}>{data.persona.title}</Text>
          <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>{data.persona.copy}</Text>
        </View>

        {/* taste */}
        <SectionHeader title="Taste profile" action={data.bars.length > COLLAPSED_BARS ? (allTaste ? 'Show fewer' : 'See all') : undefined} onAction={() => setAllTaste((v) => !v)} />
        {bars.length ? (
          <View style={styles.taste}>
            {bars.map((b) => (
              <View key={b.label} style={styles.tasteRow}>
                <Text style={[styles.tasteLabel, { color: c.textPrimary, fontFamily: typography.bodyMedium }]}>{b.label}</Text>
                <View style={styles.flex}><Progress value={b.value} /></View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>
            Finish and rate a few comics and the genres you love will appear here.
          </Text>
        )}

        {/* what the reader told us in setup */}
        <StatedTaste />

        {/* monthly goal */}
        <SectionHeader title="This month" action="Change goal" onAction={() => router.push('/edit-profile')} />
        <View style={[styles.card, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
          <View style={styles.goalTop}>
            <Text style={[styles.goalNumber, { color: c.primary, fontFamily: typography.display }]}>{data.month.count}<Text style={{ color: c.textMuted }}> / {data.month.goal}</Text></Text>
            <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>books finished</Text>
          </View>
          <Progress value={data.month.ratio} />
          <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>{data.month.message}</Text>
        </View>

        {/* journal */}
        <SectionHeader title="Your journal" action={data.history.length > recent.length ? 'View history' : undefined} onAction={() => router.push('/history')} />
        {recent.length ? recent.map((r) => (
          <Pressable key={r.workId} accessibilityRole="button" onPress={() => router.push(`/comic/${r.workId}`)} style={({ pressed }) => [styles.journal, { borderLeftColor: c.primary }, pressed && { opacity: 0.7 }]}>
            <Text style={[styles.journalDate, { color: c.textMuted, fontFamily: typography.bodyMedium }]}>{historyLine(r, data.now)}</Text>
            <Text numberOfLines={2} style={[styles.journalTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{r.title}</Text>
          </Pressable>
        )) : (
          <View style={[styles.journal, { borderLeftColor: c.primary }]}>
            <Text style={[styles.journalTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>Your reading history will appear here.</Text>
            <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>Mark a comic as reading or finished to start your record.</Text>
          </View>
        )}
        {data.history.length > 0 ? <Button kind="ghost" onPress={() => router.push('/history')}>See full history</Button> : null}
      </ScrollView>
    </AppShell>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  return (
    <View accessible accessibilityLabel={`${n} ${label}`} style={[styles.stat, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text style={[styles.statNumber, { color: c.textPrimary, fontFamily: typography.display }]}>{n}</Text>
      <Text style={[styles.statLabel, { color: c.textSecondary, fontFamily: typography.body }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 120, gap: space.md },
  flex: { flex: 1, minWidth: 0 },
  identity: { alignItems: 'center', gap: 6 },
  name: { fontSize: 26, marginTop: 6 },
  handle: { fontSize: 14 },
  bio: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 320 },
  actions: { flexDirection: 'row', gap: space.sm, alignSelf: 'stretch', marginTop: space.sm },
  stats: { flexDirection: 'row', gap: space.sm },
  stat: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: space.md, alignItems: 'center' },
  statNumber: { fontSize: 26 },
  statLabel: { fontSize: 12 },
  card: { borderWidth: 1, borderRadius: 16, padding: space.lg, gap: 8 },
  persona: { fontSize: 26 },
  body: { fontSize: 14, lineHeight: 21 },
  taste: { gap: 12 },
  tasteRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tasteLabel: { width: 120, fontSize: 14 },
  goalTop: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  goalNumber: { fontSize: 30 },
  journal: { borderLeftWidth: 2, paddingLeft: space.md, paddingVertical: 4, gap: 4 },
  journalDate: { fontSize: 12 },
  journalTitle: { fontSize: 16 },
});

/** What the reader said in setup, kept apart from what they've actually read. */
function StatedTaste() {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const selections = useOnboarding((s) => s.selections);
  const done = useOnboarding((s) => s.tasteSetupCompleted);
  const t = summarizeTaste(selections);
  const has = done && !t.empty;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Eyebrow>What you told us</Eyebrow>
      {has ? (
        <>
          {t.leanings.length ? <Text style={[styles.persona, { color: c.textPrimary, fontFamily: typography.display }]}>{t.leanings.join(' · ')}</Text> : null}
          {t.characters.length ? <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>Characters: {t.characters.join(', ')}</Text> : null}
          {t.visual.length ? <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>Art: {t.visual.join(', ')}</Text> : null}
          {t.story.length ? <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>Stories: {t.story.join(', ')}</Text> : null}
          <Text style={[styles.body, { color: c.textMuted, fontFamily: typography.body }]}>This is where you started. It changes as you read and rate.</Text>
        </>
      ) : (
        <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>You haven’t picked your favourites yet. It takes about a minute and makes recommendations better from day one.</Text>
      )}
      <Button kind="secondary" onPress={() => router.push('/onboarding?mode=edit')}>{has ? 'Edit my taste' : 'Set up my taste'}</Button>
    </View>
  );
}
