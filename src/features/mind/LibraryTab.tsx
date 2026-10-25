import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { Cover, ScoreBadge } from './ui';
import type { ReadStatus } from '../../lib/mind/engine/types';
import { makeScorer } from '../../lib/mind/taste';
import { useMindSettings } from '../../lib/mind/settings';
import { EmptyState, Pill } from '../../ui/primitives';
import { color, font, space } from '../../ui/tokens';
import type { MindData } from './useMindData';

type StatusFilter = 'all' | ReadStatus;
const STATUSES: Array<[StatusFilter, string]> = [['all', 'All'], ['planned', 'Planned'], ['reading', 'Reading'], ['finished', 'Finished'], ['dropped', 'Dropped']];
const SCORES: Array<[number, string]> = [[0, 'Any score'], [70, '70+'], [85, '85+']];

export default function LibraryTab({ data }: { data: MindData }) {
  const { width } = useWindowDimensions();
  const settings = useMindSettings();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [min, setMin] = useState(0);
  const columns = Math.max(3, Math.floor((width - space.lg * 2) / 112));
  const cell = (width - space.lg * 2 - space.md * (columns - 1)) / columns;

  const rows = useMemo(() => {
    const scorer = makeScorer(settings.weights);
    return data.series
      .filter((s) => status === 'all' || s.readStatus === status)
      .map((s) => ({ s, scored: scorer.score(s) }))
      .filter((r) => r.scored.score >= min && (min === 0 || r.scored.known));
  }, [data.series, status, min, settings.weights]);

  return (
    <View style={{ gap: space.md }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>{STATUSES.map(([k, l]) => <Pill key={k} label={l} active={status === k} onPress={() => setStatus(k)} />)}</ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>{SCORES.map(([k, l]) => <Pill key={k} label={l} active={min === k} onPress={() => setMin(k)} />)}</ScrollView>
      {rows.length === 0 ? <EmptyState mark="◇" title="Nothing here" copy="Comics you find in screenshots, and the ones you rate, are collected here by series." /> : (
        <FlashList
          data={rows}
          numColumns={columns}
          keyExtractor={(r) => r.s.id}
          scrollEnabled={false}
          renderItem={({ item: { s, scored } }) => (
            <Pressable style={{ width: cell, marginBottom: space.md }} onPress={() => router.push(`/mind/series/${encodeURIComponent(s.id)}`)}>
              <Cover uri={s.coverUrl} width={cell}>
                <View style={styles.score}><ScoreBadge score={scored.score} confidence={scored.confidence} known={scored.known} size="sm" /></View>
              </Cover>
              <Text numberOfLines={2} style={styles.title}>{s.title}</Text>
              <Text style={styles.status}>{s.readStatus}{s.verified ? '' : ' · unverified'}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pills: { gap: 8 },
  score: { position: 'absolute', bottom: 4, right: 4, backgroundColor: '#000000cc', borderRadius: 8 },
  title: { color: color.text, fontFamily: font.displayMedium, fontSize: 12, lineHeight: 15, marginTop: 6 },
  status: { color: color.faint, fontFamily: font.bodyMedium, fontSize: 11, textTransform: 'capitalize' },
});
