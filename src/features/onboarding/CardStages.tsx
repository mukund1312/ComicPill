// Art styles (visual cards), genres (visual cards) and story feel (chips):
// choose as many as fit you. All colours come from the theme.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { StageFrame } from './StageFrame';
import { PicksPanel, type PanelPick } from './PicksPanel';
import { useLayout } from '../../ui/layout';
import { EntityImage } from './EntityImage';
import { ART_STYLES, GENRE_CARDS, STORY_TRAITS } from '../../lib/onboarding/entities';
import type { PickKey } from '../../lib/onboarding/flow';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { useReducedMotion } from '../../lib/platform/motion';
import { feedback } from '../../lib/platform/feedback';

interface CardStageProps {
  picks: readonly string[]; onToggle: (key: PickKey, id: string) => void;
  progress: { index: number; total: number } | null; onBack: (() => void) | null; onNext: () => void;
}

function VisualCard({ label, blurb, workId, selected, onPress, index, width }: {
  label: string; blurb?: string; workId: string; selected: boolean; onPress: () => void; index: number; width: number;
}) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={reduced ? undefined : FadeInDown.delay(Math.min(index, 8) * 45).duration(240)} style={{ width }}>
      <Pressable
        accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={blurb ? `${label}. ${blurb}` : label}
        onPress={() => { feedback.select(); onPress(); }}
        style={({ pressed }) => [styles.card, { backgroundColor: c.surface, borderColor: selected ? c.primary : c.border, borderWidth: selected ? 2 : 1, opacity: pressed ? 0.85 : 1 }]}
      >
        <View style={styles.imageWrap}>
          <EntityImage workId={workId} name={label} size={width - 4} shape="card" height={Math.round(width * 0.8)} />
          {selected ? <View style={[styles.badge, { backgroundColor: c.primary }]}><Text style={[styles.badgeMark, { color: c.primaryForeground }]}>✓</Text></View> : null}
        </View>
        <Text style={[styles.cardTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{label}</Text>
        {blurb ? <Text numberOfLines={2} style={[styles.cardBlurb, { color: c.textSecondary, fontFamily: typography.body }]}>{blurb}</Text> : null}
      </Pressable>
    </Animated.View>
  );
}

const CARD_W = 158;

/** The left-hand "your picks" column on a landscape tablet (nothing on a phone). */
function usePanel(items: PanelPick[], key: PickKey, onToggle: (key: PickKey, id: string) => void) {
  const { isTablet, isLandscape } = useLayout();
  return isTablet && isLandscape ? <PicksPanel picks={items} onRemove={(id) => onToggle(key, id)} /> : undefined;
}

export function ArtStage({ picks, onToggle, ...rest }: CardStageProps) {
  const panel = usePanel(ART_STYLES.filter((a) => picks.includes(a.id)).map((a) => ({ id: a.id, label: a.label, workId: a.exemplarWorkId })), 'artStyles', onToggle);
  return (
    <StageFrame picksPanel={panel} title="What art pulls you in?" subtitle="Tap every look you’d happily read. There’s no wrong answer." {...rest} primaryLabel="Continue" onPrimary={rest.onNext} onSkip={rest.onNext} skipLabel="Skip this">
      <View style={styles.grid}>
        {ART_STYLES.map((a, i) => <VisualCard key={a.id} index={i} width={CARD_W} label={a.label} blurb={a.blurb} workId={a.exemplarWorkId} selected={picks.includes(a.id)} onPress={() => onToggle('artStyles', a.id)} />)}
      </View>
    </StageFrame>
  );
}

export function GenreStage({ picks, onToggle, ...rest }: CardStageProps) {
  const panel = usePanel(GENRE_CARDS.filter((g) => picks.includes(g.id)).map((g) => ({ id: g.id, label: g.label, workId: g.exemplarWorkId })), 'genres', onToggle);
  return (
    <StageFrame picksPanel={panel} title="What kinds of stories?" subtitle="Choose the genres you keep coming back to." {...rest} primaryLabel="Continue" onPrimary={rest.onNext} onSkip={rest.onNext} skipLabel="Skip this">
      <View style={styles.grid}>
        {GENRE_CARDS.map((g, i) => <VisualCard key={g.id} index={i} width={CARD_W} label={g.label} workId={g.exemplarWorkId} selected={picks.includes(g.id)} onPress={() => onToggle('genres', g.id)} />)}
      </View>
    </StageFrame>
  );
}

export function TraitStage({ picks, onToggle, onFinish, finishLabel, ...rest }: CardStageProps & { onFinish: () => void; finishLabel: string }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const reduced = useReducedMotion();
  const panel = usePanel(STORY_TRAITS.filter((t) => picks.includes(t.id)).map((t) => ({ id: t.id, label: t.label })), 'traits', onToggle);
  return (
    <StageFrame picksPanel={panel} title="How should a story feel?" subtitle="Pick what you want more of." progress={rest.progress} onBack={rest.onBack} primaryLabel={finishLabel} onPrimary={onFinish} onSkip={onFinish} skipLabel="Skip this">
      <View style={styles.chips}>
        {STORY_TRAITS.map((t, i) => {
          const on = picks.includes(t.id);
          return (
            <Animated.View key={t.id} entering={reduced ? undefined : FadeInDown.delay(Math.min(i, 10) * 35).duration(220)}>
              <Pressable
                accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => { feedback.select(); onToggle('traits', t.id); }}
                style={({ pressed }) => [styles.chip, { backgroundColor: on ? c.primaryMuted : c.surface, borderColor: on ? c.primary : c.border, opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={[styles.chipText, { color: on ? c.textPrimary : c.textSecondary, fontFamily: on ? typography.bodySemibold : typography.body }]}>{on ? '✓  ' : ''}{t.label}</Text>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </StageFrame>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, justifyContent: 'space-between' },
  card: { borderRadius: 16, padding: 2, paddingBottom: space.sm, gap: 4, overflow: 'hidden' },
  imageWrap: { alignItems: 'center' },
  badge: { position: 'absolute', right: 8, top: 8, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeMark: { fontSize: 14 },
  cardTitle: { fontSize: 16, paddingHorizontal: 8, marginTop: 4 },
  cardBlurb: { fontSize: 12, lineHeight: 16, paddingHorizontal: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' },
  chipText: { fontSize: 16 },
});
