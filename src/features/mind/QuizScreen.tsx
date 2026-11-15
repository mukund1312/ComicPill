import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { makeDeps } from '../../lib/mind/deps';
import { ratedCount, listRatings } from '../../lib/mind/queries';
import { answerQuiz, QUIZ_TARGET, quizDeck } from '../../lib/mind/quiz';
import { updateMindSettings } from '../../lib/mind/settings';
import { SettingsPage } from '../../ui/SettingsPage';
import { ComicCover } from '../../ui/comic';
import { font, radius, space, type } from '../../ui/tokens';
import { useThemed, type Palette } from '../../ui/theme';
import { SmallButton } from './ui';

export default function QuizScreen() {
  const { color, styles } = useThemed(makeStyles);
  const [answered, setAnswered] = useState(() => ratedCount());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const seen = useMemo(() => new Set(listRatings().map((r) => r.seriesId)), [answered]); // eslint-disable-line react-hooks/exhaustive-deps
  const deck = useMemo(() => quizDeck(), []);
  const current = deck.find((d) => !seen.has(`local:${d.externalId}`) && !skipped.has(d.externalId));
  const done = answered >= QUIZ_TARGET;

  const answer = async (a: { rating: number } | { dropped: true }) => {
    if (!current || busy) return;
    setBusy(true);
    try { await answerQuiz(current, a, await makeDeps()); setAnswered(ratedCount()); } finally { setBusy(false); }
  };
  const finish = () => { updateMindSettings({ quizDone: true }); router.back(); };

  return (
    <SettingsPage title="Your taste" subtitle={`Rate comics you’ve already read. ${Math.min(answered, QUIZ_TARGET)} of ${QUIZ_TARGET}${done ? ' — that’s enough to start, keep going if you like.' : ''}`}>
      {current ? (
        <View style={styles.card}>
          <ComicCover title={current.title} workId={current.externalId} size="hero" />
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.sub}>{[...current.genres.slice(0, 2), current.creators[0]].filter(Boolean).join(' · ')}</Text>
          <View style={styles.stars}>{[1, 2, 3, 4, 5].map((n) => <Pressable key={n} disabled={busy} onPress={() => answer({ rating: n })} hitSlop={4}><Text style={styles.star}>★</Text><Text style={styles.num}>{n}</Text></Pressable>)}</View>
          <View style={styles.row}>
            <SmallButton label="Dropped it" disabled={busy} onPress={() => answer({ dropped: true })} />
            <SmallButton label="Haven’t read it" kind="ghost" disabled={busy} onPress={() => setSkipped((s) => new Set(s).add(current.externalId))} />
            {busy ? <ActivityIndicator color={color.accent} /> : null}
          </View>
        </View>
      ) : <Text style={styles.sub}>That’s all the well-known titles. You can add more by rating comics from the Library tab as you finish them.</Text>}
      <View style={{ marginTop: space.lg }}><SmallButton label={done || !current ? 'Done' : 'Finish later'} kind={done ? 'primary' : 'secondary'} onPress={done || !current ? finish : () => router.back()} /></View>
    </SettingsPage>
  );
}

const makeStyles = (color: Palette) => StyleSheet.create({
  card: { alignItems: 'center', gap: space.md, marginTop: space.lg, backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, padding: space.lg },
  title: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle, textAlign: 'center' },
  sub: { color: color.muted, fontFamily: font.body, fontSize: type.caption, textAlign: 'center' },
  stars: { flexDirection: 'row', gap: space.md },
  star: { color: color.collectGold, fontSize: 40, textAlign: 'center' },
  num: { color: color.faint, fontSize: 11, textAlign: 'center' },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
});
