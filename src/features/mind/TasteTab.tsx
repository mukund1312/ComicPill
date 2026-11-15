import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Cover, SectionTitle, SmallButton } from './ui';
import { buildProfile, SIGNAL_LABEL, type Signal } from '../../lib/mind/engine/tasteScorer';
import { listRatings } from '../../lib/mind/queries';
import { useMindSettings } from '../../lib/mind/settings';
import { makeScorer } from '../../lib/mind/taste';
import { EmptyState } from '../../ui/primitives';
import { font, space, type } from '../../ui/tokens';
import { useThemed, type Palette } from '../../ui/theme';
import type { MindData } from './useMindData';

function top(profile: ReturnType<typeof buildProfile>, signal: Signal, n = 5): Array<{ tag: string; value: number }> {
  return [...profile[signal].entries()].map(([tag, s]) => ({ tag, value: s.sum / (s.n + 1), n: s.n })).filter((x) => x.n >= 1).sort((a, b) => b.value - a.value).slice(0, n);
}

export default function TasteTab({ data }: { data: MindData }) {
  const { styles } = useThemed(makeStyles);
  const settings = useMindSettings();
  const view = useMemo(() => {
    const ratings = listRatings();
    const scorer = makeScorer(settings.weights);
    return { ratings, profile: buildProfile(scorer.events), cal: scorer.calibration() };
  }, [data.series, settings.weights]);

  if (view.ratings.length === 0) {
    return <EmptyState mark="★" title="Teach it your taste" copy="Rate 15–20 comics you’ve already read. Scores stay greyed out until it has enough to go on." action="Start the quiz" onAction={() => router.push('/mind/quiz')} />;
  }

  const lovedGenres = top(view.profile, 'genre'); const lovedCreators = top(view.profile, 'creator');
  return (
    <View style={{ gap: space.md }}>
      <Card>
        <Text style={styles.big}>{view.ratings.length} rated</Text>
        <Text style={styles.body}>{view.ratings.length < 10 ? 'Scores will say “low confidence” until about 10 comics near a title’s genre are rated.' : view.cal.n >= 8
          ? `Checked against your own ratings, ${Math.round(view.cal.within10 * 100)}% of scores land within 10 points (off by ${Math.round(view.cal.mae)} on average).${view.ratings.length >= 40 ? '' : ' It gets more reliable around 40 ratings.'}`
          : 'Keep rating — the app checks its own scores against yours once there are enough.'}</Text>
        <View style={styles.row}><SmallButton label="Rate more" onPress={() => router.push('/mind/quiz')} /><SmallButton label="Edit weights" kind="ghost" onPress={() => router.push('/mind/settings')} /></View>
      </Card>

      {lovedGenres.length ? <><SectionTitle>Top genres and themes</SectionTitle><Text style={styles.body}>{lovedGenres.map((g) => g.tag).join(' · ')}</Text></> : null}
      {lovedCreators.length ? <><SectionTitle>Top creators</SectionTitle><Text style={styles.body}>{lovedCreators.map((g) => g.tag).join(' · ')}</Text></> : null}
      <SectionTitle>How each signal predicts you</SectionTitle>
      {(Object.keys(SIGNAL_LABEL) as Signal[]).map((s) => (
        <View key={s} style={styles.sigRow}><Text style={styles.body}>{SIGNAL_LABEL[s]} · {Math.round(settings.weights[s] * 100)}%</Text><Text style={styles.faint}>{view.cal.perSignal[s].n >= 3 ? `off by ${Math.round(view.cal.perSignal[s].mae)} pts` : 'not enough data'}</Text></View>
      ))}

      <SectionTitle>Your ratings</SectionTitle>
      {view.ratings.map((r) => (
        <Pressable key={r.seriesId} style={styles.rating} onPress={() => router.push(`/mind/series/${encodeURIComponent(r.seriesId)}`)}>
          <Cover uri={r.series.coverUrl} width={36} />
          <View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.body}>{r.series.title}</Text><Text style={styles.faint}>{r.overrideScore !== null ? `You set ${r.overrideScore}/100` : r.dropped ? 'Dropped' : `${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}`}</Text></View>
        </Pressable>
      ))}
      <Text style={styles.faint}>Wrong about you? Open any comic and tap “I disagree” — it counts double.</Text>
    </View>
  );
}

const makeStyles = (color: Palette) => StyleSheet.create({
  big: { color: color.text, fontFamily: font.displayMedium, fontSize: 28 },
  body: { color: color.text, fontFamily: font.body, fontSize: type.body, lineHeight: 22 },
  faint: { color: color.muted, fontFamily: font.body, fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', gap: space.sm },
  sigRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rating: { flexDirection: 'row', gap: space.md, alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: color.border },
});
