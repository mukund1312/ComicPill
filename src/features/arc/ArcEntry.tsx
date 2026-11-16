// The Paths screen's door into arcs: a "Build me an arc" card plus the
// reader's saved journeys, each showing what to read next.
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Button, Eyebrow } from '../../ui/primitives';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { listRabbitHoles, listUserArcs, loadWorkTitles, planForUserArc, removeRabbitHole } from '../../lib/db/queries/arc';

export default function ArcEntry() {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const [tick, setTick] = useState(0);
  useFocusEffect(useCallback(() => { setTick((t) => t + 1); }, []));

  const journeys = useMemo(() => {
    const titles = loadWorkTitles();
    return listUserArcs().flatMap((arc) => {
      const plan = planForUserArc(arc);
      if (!plan) return [];
      return [{ id: arc.id, title: plan.title, branchOf: arc.parentArcId ? planForUserArc(listUserArcs().find((x) => x.id === arc.parentArcId)!)?.title ?? null : null, percent: plan.percentComplete, next: plan.nextStep ? (titles.get(plan.nextStep.workId) ?? plan.nextStep.workId) : null }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const holes = useMemo(() => listRabbitHoles(), [tick]);

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.primary }]}>
        <Eyebrow>New</Eyebrow>
        <Text style={[styles.title, { color: c.textPrimary, fontFamily: typography.display }]}>Build me an arc</Text>
        <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>
          Turn a goal — “Batman from his origin through the Robins” — into a curated journey built around what you own and have read.
        </Text>
        <Button onPress={() => router.push('/arc/new')}>Build me an arc  →</Button>
      </View>
      {journeys.length ? <Eyebrow>Your journeys</Eyebrow> : null}
      {journeys.map((j) => (
        <Pressable key={j.id} onPress={() => router.push(`/arc/${j.id}`)} accessibilityRole="button" style={[styles.journey, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text numberOfLines={2} style={[styles.journeyTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{j.title}</Text>
          {j.branchOf ? <Text style={[styles.body, { color: c.textMuted, fontFamily: typography.bodyMedium }]}>Side journey from {j.branchOf}</Text> : null}
          <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>
            {j.percent}% complete{j.next ? ` · Next: ${j.next}` : ''}
          </Text>
        </Pressable>
      ))}
      {holes.length ? <Eyebrow>Your rabbit holes</Eyebrow> : null}
      {holes.map((h) => (
        <View key={h.id} style={[styles.journey, styles.holeRow, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.holeText}>
            <Text style={[styles.journeyTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{h.topic}</Text>
            <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>Saved for later</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${h.topic}`} onPress={() => { removeRabbitHole(h.id); setTick((t) => t + 1); }}>
            <Text style={[styles.body, { color: c.textMuted, fontFamily: typography.bodyMedium }]}>Remove</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md, marginBottom: space.lg },
  card: { borderWidth: 1, borderRadius: 18, padding: space.lg, gap: space.sm },
  title: { fontSize: 22 },
  body: { fontSize: 14, lineHeight: 19 },
  journey: { borderWidth: 1, borderRadius: 14, padding: space.md, gap: 4 },
  journeyTitle: { fontSize: 16 },
  holeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  holeText: { flex: 1, gap: 2 },
});
