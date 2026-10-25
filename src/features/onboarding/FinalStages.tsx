import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { StageFrame } from './StageFrame';
import { ComicCover } from '../../ui/comic';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { useReducedMotion } from '../../lib/platform/motion';
import { libraryReadySummary } from '../../lib/onboarding/collectionDraft';
import { libraryStatsNow, readableLibraryIds } from '../../lib/db/queries/onboardingData';
import { compareForRead } from '../../lib/db/queries/compare';

export function LibraryReadyStage({ onNext }: { onNext: () => void }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const reduced = useReducedMotion();
  const stats = useMemo(() => libraryStatsNow(), []);
  const cells: [string, number][] = [['Comics', stats.total], ['Physical', stats.physical], ['Digital', stats.digital], ['Unread', stats.unread], ['Wishlist', stats.wishlist]];
  return (
    <StageFrame
      title={stats.total ? 'Your library is ready.' : 'Your library is a fresh start.'}
      subtitle={libraryReadySummary(stats)}
      primaryLabel="See what to read first" onPrimary={onNext}
    >
      <View style={styles.grid}>
        {cells.filter(([, n]) => n > 0 || stats.total === 0).map(([label, n], i) => (
          <Animated.View key={label} entering={reduced ? undefined : FadeInDown.delay(i * 70).duration(260)} style={[styles.cell, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.num, { color: c.textPrimary, fontFamily: typography.display }]}>{n}</Text>
            <Text style={[styles.label, { color: c.textMuted, fontFamily: typography.bodyMedium }]}>{label}</Text>
          </Animated.View>
        ))}
      </View>
    </StageFrame>
  );
}

/** The first personalised recommendation: the same read-decision engine Compare
 *  uses, run over the books the reader just told us they own and haven't finished. */
export function FirstPickStage({ onDone, onBrowse }: { onDone: () => void; onBrowse: () => void }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const reduced = useReducedMotion();
  const outcome = useMemo(() => {
    const ids = readableLibraryIds();
    if (ids.length === 0) return null;
    try {
      return compareForRead(ids, { now: new Date(), mood: null, intent: 'best', travelMode: 'any', rereadsAllowed: false });
    } catch {
      return null;
    }
  }, []);
  const [index, setIndex] = useState(0);
  const order = outcome?.decision.order ?? [];
  const primary = outcome?.decision.primary ?? null;

  if (!outcome || !primary || order.length === 0) {
    return (
      <StageFrame title="You’re all set." subtitle="Add a few comics to your library and ComicPill will tell you what to read first. Until then, Discover has plenty to try." primaryLabel="Take me to Today" onPrimary={onDone} onSkip={onBrowse} skipLabel="Add comics now" />
    );
  }

  const entry = order[Math.min(index, order.length - 1)];
  const isTop = index === 0;
  const reasons = (entry.caseFor.length ? entry.caseFor : entry.pros.map((p) => p.text ?? '')).filter(Boolean).slice(0, 3);
  return (
    <StageFrame
      title={isTop ? 'Start here.' : 'Or try this.'} subtitle="Picked from what’s on your shelf, using your taste so far."
      primaryLabel="Take me to Today" onPrimary={onDone}
      onSkip={order.length > 1 ? () => setIndex((i) => (i + 1) % order.length) : undefined} skipLabel="Show me something else"
    >
      <Animated.View key={entry.workId} entering={reduced ? undefined : FadeInDown.duration(280)} style={[styles.pick, { backgroundColor: c.surface, borderColor: c.primary }]}>
        <ComicCover title={entry.title} workId={entry.workId} size="hero" recyclingKey={`onb-pick-${entry.workId}`} />
        <Text style={[styles.pickTitle, { color: c.textPrimary, fontFamily: typography.display }]}>{entry.title}</Text>
        {isTop ? <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>{primary.explanation}</Text> : null}
        {reasons.length ? (
          <View style={styles.reasons}>
            <Text style={[styles.label, { color: c.textMuted, fontFamily: typography.bodySemibold }]}>WHY THIS ONE</Text>
            {reasons.map((r) => <Text key={r} style={[styles.body, { color: c.textPrimary, fontFamily: typography.body }]}>• {r}</Text>)}
          </View>
        ) : null}
        {outcome.decision.confidence !== 'high' && outcome.decision.closeCall ? <Text style={[styles.body, { color: c.textMuted, fontFamily: typography.body }]}>{outcome.decision.closeCall}</Text> : null}
      </Animated.View>
    </StageFrame>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  cell: { minWidth: 100, flexGrow: 1, borderWidth: 1, borderRadius: 16, padding: space.lg, gap: 2 },
  num: { fontSize: 34 },
  label: { fontSize: 12 },
  pick: { borderWidth: 1, borderRadius: 20, padding: space.lg, gap: space.md, alignItems: 'flex-start' },
  pickTitle: { fontSize: 24, lineHeight: 30 },
  body: { fontSize: 14, lineHeight: 21 },
  reasons: { gap: 4 },
});
