// "Relevant to you": shown on a comic's page and on Discover cards when the
// book belongs to a journey the reader is following. Renders nothing when it
// doesn't, so it never adds clutter for books unrelated to any journey.
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Eyebrow } from '../../ui/primitives';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { loadActiveArcs, loadMemberships, loadWorkTitles } from '../../lib/db/queries/arc';
import { getFundVerdict } from '../../lib/db/queries/wallet';
import { primaryMembership, readGuidance } from '../../lib/engines/arc/membership';
import type { ArcPlan } from '../../lib/engines/arc/types';
import { guidanceView, relevanceView, type GuidanceView } from './relevance';

/** Advice for getting a book the reader doesn't have. The fund verdict is only
 *  computed when the journey says buying is actually on the table. */
export function useGuidance(plan: ArcPlan, workId: string, titleOf: (id: string) => string, enabled = true): GuidanceView | null {
  return useMemo(() => {
    if (!enabled) return null;
    const g = readGuidance(plan, workId);
    const verdict = g.kind === 'consider_buying' ? getFundVerdict(workId, new Date()) : null;
    return guidanceView(g, titleOf, verdict);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, workId, enabled]);
}

export function GuidanceBlock({ view }: { view: GuidanceView | null }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  if (!view) return null;
  return (
    <View style={[styles.guidance, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
      <Text style={[styles.eyebrow, { color: c.textMuted, fontFamily: typography.bodySemibold }]}>HOW SHOULD YOU READ THIS?</Text>
      <Text style={[styles.guidanceLabel, { color: view.label === 'WAIT' ? c.warning : c.primary, fontFamily: typography.bodySemibold }]}>{view.label}</Text>
      <Text style={[styles.body, { color: c.textPrimary, fontFamily: typography.body }]}>{view.text}</Text>
    </View>
  );
}

export default function ArcRelevance({ workId, compact = false }: { workId: string; compact?: boolean }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;

  const data = useMemo(() => {
    const arcs = loadActiveArcs();
    const m = primaryMembership(loadMemberships(arcs).get(workId));
    if (!m) return null;
    const arc = arcs.find((a) => a.id === m.arcId);
    if (!arc) return null;
    const titles = loadWorkTitles();
    const titleOf = (id: string) => titles.get(id) ?? id;
    return { view: relevanceView(m, titleOf), plan: arc.plan, titleOf, unowned: m.state === 'not_owned' };
  }, [workId]);

  const guidance = useGuidance(data?.plan ?? EMPTY_PLAN, workId, data?.titleOf ?? ((id) => id), !!data && data.unowned && !compact);
  if (!data) return null;

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: data.view.isNext ? c.primary : c.border }]}>
      <Eyebrow>Relevant to you</Eyebrow>
      <Text style={[styles.title, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{data.view.arcTitle}</Text>
      <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>{data.view.line}</Text>
      {!compact ? <GuidanceBlock view={guidance} /> : null}
      {!compact ? (
        <Pressable accessibilityRole="button" onPress={() => router.push(`/arc/${data.view.arcId}`)}>
          <Text style={[styles.link, { color: c.primary, fontFamily: typography.bodySemibold }]}>View in path  →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Stable placeholder so the hook is called unconditionally.
const EMPTY_PLAN = {
  key: '', title: '', goal: '', depth: 'recommended', chapters: [], endgame: null, family: null, branchOffers: [], milestonesComplete: 0,
  milestonesTotal: 0, percentComplete: 0, currentMilestoneId: null, upcomingMilestone: null, nextStep: null, atEndgame: false,
} as ArcPlan;

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: space.md, gap: 6 },
  title: { fontSize: 16 },
  body: { fontSize: 13, lineHeight: 19 },
  link: { fontSize: 13, marginTop: 2 },
  guidance: { borderWidth: 1, borderRadius: 10, padding: space.sm, gap: 3, marginTop: 4 },
  eyebrow: { fontSize: 10, letterSpacing: 1.4 },
  guidanceLabel: { fontSize: 13 },
});
