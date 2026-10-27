// The reusable picking surface behind characters, villains, artists and writers:
// circles you tap. A tap selects (a small bounce and a check), the pick moves up
// into YOUR PICKS, and a few related choices flow in below. Search is always there.
// With "reduce motion" on, everything still works — it just doesn't move.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type ImageSourcePropType } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, ZoomIn, ZoomOut, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { EntityImage } from './EntityImage';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { useReducedMotion } from '../../lib/platform/motion';
import { feedback } from '../../lib/platform/feedback';

export interface Choice { id: string; label: string; sub?: string; workId?: string; photo?: ImageSourcePropType }

export const TILE = 86;

export function Tile({ choice, selected, onPress, reduced, index = 0, shape = 'circle', size = TILE }: {
  choice: Choice; selected: boolean; onPress: () => void; reduced: boolean; index?: number; shape?: 'circle' | 'card'; size?: number;
}) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const scale = useSharedValue(1);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const press = () => {
    if (!reduced) scale.set(withSequence(withTiming(0.92, { duration: 80 }), withSpring(1.06, { damping: 8 }), withSpring(1, { damping: 12 })));
    feedback.select();
    onPress();
  };
  return (
    <Animated.View
      layout={reduced ? undefined : LinearTransition.duration(240)}
      entering={reduced ? undefined : ZoomIn.delay(Math.min(index, 6) * 50).duration(220)}
      exiting={reduced ? undefined : ZoomOut.duration(160)}
      style={{ width: size + 18 }}
    >
      <Pressable
        accessibilityRole="button" accessibilityLabel={`${choice.label}${choice.sub ? `, ${choice.sub}` : ''}`}
        accessibilityState={{ selected }} onPress={press} style={styles.tile}
      >
        <Animated.View style={pop}>
          <View style={[styles.ring, { width: size + 6, height: size + 6, borderRadius: (size + 6) / 2, borderColor: selected ? c.primary : 'transparent' }]}>
            <EntityImage workId={choice.workId} photo={choice.photo} name={choice.label} size={size} shape={shape} />
          </View>
          {selected ? (
            <Animated.View entering={reduced ? undefined : ZoomIn.duration(160)} style={[styles.check, { backgroundColor: c.primary, borderColor: c.background }]}>
              <Text style={[styles.checkMark, { color: c.primaryForeground }]}>✓</Text>
            </Animated.View>
          ) : null}
        </Animated.View>
        <Text numberOfLines={2} style={[styles.name, { color: selected ? c.textPrimary : c.textSecondary, fontFamily: selected ? typography.bodySemibold : typography.body }]}>{choice.label}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function PreferenceDiscoveryGrid({ choices, picks, onToggle, search, emptyHint, picksTitle = 'YOUR PICKS', picksElsewhere = false }: {
  choices: Choice[];
  picks: Choice[];
  onToggle: (id: string) => void;
  /** Search across the whole pool. Results already picked show as selected. */
  search: (query: string) => Choice[];
  emptyHint: string;
  picksTitle?: string;
  /** The picks are shown in a separate column (tablet), so don't repeat them here. */
  picksElsewhere?: boolean;
}) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const reduced = useReducedMotion();
  const [query, setQuery] = useState('');
  const results = query.trim() ? search(query) : [];
  const pickedIds = new Set(picks.map((p) => p.id));

  return (
    <View style={styles.wrap}>
      <View style={[styles.searchBox, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
        <TextInput
          accessibilityLabel="Search" value={query} onChangeText={setQuery} placeholder="Search by name" placeholderTextColor={c.textMuted}
          autoCapitalize="none" autoCorrect={false} returnKeyType="search"
          style={[styles.search, { color: c.textPrimary, fontFamily: typography.body }]}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => setQuery('')}><Text style={[styles.clear, { color: c.textMuted }]}>✕</Text></Pressable>
        ) : null}
      </View>

      {query.trim() ? (
        <View style={styles.results}>
          {results.length === 0 ? (
            <Text style={[styles.hint, { color: c.textMuted, fontFamily: typography.body }]}>Nothing found for “{query.trim()}”. Try another spelling, or skip this one.</Text>
          ) : results.map((r) => {
            const on = pickedIds.has(r.id);
            return (
              <Pressable
                key={r.id} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={r.label}
                onPress={() => { feedback.select(); onToggle(r.id); }}
                style={({ pressed }) => [styles.resultRow, { borderColor: on ? c.primary : c.border, backgroundColor: pressed ? c.surfaceRaised : c.surface }]}
              >
                <EntityImage workId={r.workId} photo={r.photo} name={r.label} size={44} />
                <View style={styles.flex}>
                  <Text numberOfLines={1} style={[styles.resultName, { color: c.textPrimary, fontFamily: typography.bodyMedium }]}>{r.label}</Text>
                  {r.sub ? <Text numberOfLines={1} style={[styles.hint, { color: c.textMuted, fontFamily: typography.body }]}>{r.sub}</Text> : null}
                </View>
                <Text style={{ color: on ? c.primary : c.textMuted, fontSize: 20 }}>{on ? '✓' : '＋'}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {picks.length > 0 && !picksElsewhere ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: c.textMuted, fontFamily: typography.bodySemibold }]}>{picksTitle} · {picks.length}</Text>
          <View style={[styles.row, styles.picksRow, { backgroundColor: c.surface, borderColor: c.border }]}>
            {picks.map((p) => <Tile key={p.id} choice={p} selected reduced={reduced} onPress={() => onToggle(p.id)} size={58} />)}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.row}>
          {choices.map((ch, i) => <Tile key={ch.id} choice={ch} selected={false} reduced={reduced} index={i} onPress={() => onToggle(ch.id)} />)}
        </View>
        {choices.length === 0 ? (
          <Animated.Text entering={reduced ? undefined : FadeIn} exiting={reduced ? undefined : FadeOut} style={[styles.hint, { color: c.textMuted, fontFamily: typography.body }]}>{emptyHint}</Animated.Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  flex: { flex: 1, minWidth: 0 },
  searchBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14 },
  search: { flex: 1, minHeight: 48, fontSize: 16 },
  clear: { fontSize: 16, paddingLeft: 8 },
  results: { gap: 8 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderRadius: 14, padding: space.sm },
  resultName: { fontSize: 15 },
  hint: { fontSize: 13, lineHeight: 18 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 11, letterSpacing: 1.4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, justifyContent: 'center' },
  picksRow: { borderWidth: 1, borderRadius: 16, padding: space.sm },
  tile: { alignItems: 'center', gap: 6, paddingVertical: 4, minHeight: 44 },
  ring: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  check: { position: 'absolute', right: -2, top: -2, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  checkMark: { fontSize: 12, lineHeight: 14 },
  name: { fontSize: 12, textAlign: 'center', lineHeight: 15 },
});
