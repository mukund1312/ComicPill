import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { StageFrame } from './StageFrame';
import { EntityImage } from './EntityImage';
import { summarizeTaste, type Confidence, type TasteSelections } from '../../lib/onboarding/taste';
import { CHARACTER_BY_ID } from '../../lib/onboarding/entities';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { useReducedMotion } from '../../lib/platform/motion';

const CONF_WORD: Record<Confidence, string> = { unknown: 'Not yet known', low: 'Early guess', medium: 'Fair idea', high: 'Fairly sure' };

function Section({ title, items, delay }: { title: string; items: string[]; delay: number }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const reduced = useReducedMotion();
  if (items.length === 0) return null;
  return (
    <Animated.View entering={reduced ? undefined : FadeInDown.delay(delay).duration(300)} style={styles.section}>
      <Text style={[styles.label, { color: c.textMuted, fontFamily: typography.bodySemibold }]}>{title.toUpperCase()}</Text>
      <Text style={[styles.value, { color: c.textPrimary, fontFamily: typography.body }]}>{items.join('  ·  ')}</Text>
    </Animated.View>
  );
}

export function RevealStage({ selections, onNext }: { selections: TasteSelections; onNext: () => void }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const reduced = useReducedMotion();
  const t = summarizeTaste(selections);
  const faces = selections.characters.slice(0, 5).flatMap((id) => { const e = CHARACTER_BY_ID.get(id); return e ? [e] : []; });
  return (
    <StageFrame title={t.empty ? 'A blank slate.' : 'Here’s where you’re starting.'} subtitle={t.empty ? 'That’s fine — ComicPill will learn from what you read and rate.' : 'This will evolve as you read.'} primaryLabel="Build my library" onPrimary={onNext}>
      {!t.empty ? (
        <View style={styles.wrap}>
          {faces.length ? <View style={styles.faces}>{faces.map((f) => <EntityImage key={f.id} workId={f.signatureWorkId} name={f.name} size={52} />)}</View> : null}
          {t.leanings.length ? (
            <Animated.View entering={reduced ? undefined : FadeInDown.duration(300)} style={[styles.hero, { backgroundColor: c.surface, borderColor: c.primary }]}>
              <Text style={[styles.label, { color: c.textMuted, fontFamily: typography.bodySemibold }]}>YOU LEAN TOWARD</Text>
              <Text style={[styles.heroText, { color: c.textPrimary, fontFamily: typography.display }]}>{t.leanings.join(' · ')}</Text>
            </Animated.View>
          ) : null}
          <Section title="Characters" items={t.characters} delay={120} />
          <Section title="Art you like" items={t.visual} delay={200} />
          <Section title="Stories you like" items={t.story} delay={280} />
          <Animated.View entering={reduced ? undefined : FadeInDown.delay(360).duration(300)} style={[styles.conf, { borderColor: c.border }]}>
            <Text style={[styles.label, { color: c.textMuted, fontFamily: typography.bodySemibold }]}>HOW SURE WE ARE</Text>
            {([['Characters', t.confidence.characters], ['Genres & feel', t.confidence.genres], ['Artwork', t.confidence.artwork], ['Creators', t.confidence.creators], ['Your reading habits', t.confidence.reading]] as const).map(([k, v]) => (
              <View key={k} style={styles.confRow}>
                <Text style={[styles.confKey, { color: c.textSecondary, fontFamily: typography.body }]}>{k}</Text>
                <Text style={[styles.confVal, { color: v === 'unknown' || v === 'low' ? c.textMuted : c.textPrimary, fontFamily: typography.bodyMedium }]}>{CONF_WORD[v]}</Text>
              </View>
            ))}
          </Animated.View>
        </View>
      ) : null}
    </StageFrame>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  faces: { flexDirection: 'row', gap: 8 },
  hero: { borderWidth: 1, borderRadius: 18, padding: space.lg, gap: 6 },
  heroText: { fontSize: 26, lineHeight: 32 },
  section: { gap: 4 },
  label: { fontSize: 11, letterSpacing: 1.4 },
  value: { fontSize: 16, lineHeight: 24 },
  conf: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.md, gap: 8 },
  confRow: { flexDirection: 'row', justifyContent: 'space-between' },
  confKey: { fontSize: 14 },
  confVal: { fontSize: 14 },
});
