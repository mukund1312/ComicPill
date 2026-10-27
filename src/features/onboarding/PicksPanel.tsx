// The tablet's left-hand "your picks" column. Whatever you tap on the right slides across into here; tap one here to take it back out.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, LinearTransition, SlideInRight } from 'react-native-reanimated';
import { EntityImage } from './EntityImage';
import { Icon } from '../../ui/Icon';
import { useAppearance } from '../../ui/theme';
import { useReducedMotion } from '../../lib/platform/motion';
import { feedback } from '../../lib/platform/feedback';
import type { Choice } from './PreferenceDiscoveryGrid';

export type PanelPick = Choice & { label: string };

export function PicksPanel({ picks, onRemove, title = 'Your picks', empty = 'Tap what you like on the right and it lands here.' }: { picks: PanelPick[]; onRemove: (id: string) => void; title?: string; empty?: string }) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const reduced = useReducedMotion();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.head, { color: c.textMuted, fontFamily: typography.bodySemibold }]}>{title.toUpperCase()} · {picks.length}</Text>
      <View style={[styles.box, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
        {picks.length === 0 ? <Text style={[styles.empty, { color: c.textMuted, fontFamily: typography.body }]}>{empty}</Text> : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
            {picks.map((p) => (
              <Animated.View key={p.id} layout={reduced ? undefined : LinearTransition.duration(260)} entering={reduced ? undefined : SlideInRight.duration(320)} exiting={reduced ? undefined : FadeOut.duration(140)}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${p.label}`} onPress={() => { feedback.select(); onRemove(p.id); }} style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
                  <EntityImage workId={p.workId} photo={p.photo} name={p.label} size={44} />
                  <Text numberOfLines={2} style={[styles.name, { color: c.textPrimary, fontFamily: typography.bodyMedium }]}>{p.label}</Text>
                  <Icon name="close" size={16} color={c.textMuted} />
                </Pressable>
              </Animated.View>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 0, gap: 8 },
  head: { fontSize: 11, letterSpacing: 1.4 },
  box: { flex: 1, minHeight: 120, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, padding: 10, overflow: 'hidden' },
  empty: { fontSize: 14, lineHeight: 20, padding: 8 },
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 8, paddingRight: 14 },
  name: { flex: 1, fontSize: 15 },
});
