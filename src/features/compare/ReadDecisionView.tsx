// The Compare "read" result. Leads with the DECISION — what to read, why now,
// what after — then the order, the books already read, the case for and
// against each candidate, and what would change the answer. The ten
// dimensions are supporting evidence, tucked behind "Compare at a glance".
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ComicCover } from '../../ui/comic';
import { Button, Eyebrow, Pill } from '../../ui/primitives';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { upsertLibraryEntry } from '../../lib/db/queries/library';
import type { ReadCompareOutcome } from '../../lib/db/queries/compare';
import type { Intent, RankedEntry } from '../../lib/engines/compare/decide/types';
import { excludedLine, hasRereadable, INTENT_CHIPS, intentNote, primaryAction, roleBadge } from './readView';

export interface ReadDecisionViewProps {
  outcome: ReadCompareOutcome;
  intent: Intent;
  onIntent: (intent: Intent) => void;
  rereads: boolean;
  onToggleRereads: () => void;
  travelDigital: boolean;
  onEdit: () => void;
}

export default function ReadDecisionView({ outcome, intent, onIntent, rereads, onToggleRereads, travelDigital, onEdit }: ReadDecisionViewProps) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const [glanceOpen, setGlanceOpen] = useState(false);
  const { decision, challenge } = outcome;
  const top = decision.order[0] ?? null;
  const note = intentNote(intent);

  const open = (workId: string) => router.push(`/comic/${workId}`);
  const start = () => {
    if (!top) return;
    if (top.tier === 0 && !top.isReread) upsertLibraryEntry(top.workId, { status: 'reading' });
    open(top.workId);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text onPress={onEdit} style={[styles.back, { color: c.textSecondary, fontFamily: typography.bodyMedium }]}>‹ Edit choices</Text>

      {/* What matters tonight */}
      <Text style={[styles.label, { color: c.textMuted, fontFamily: typography.bodySemibold }]}>WHAT MATTERS TONIGHT?</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {INTENT_CHIPS.map((chip) => (
          <Pill key={chip.id} label={chip.label} active={intent === chip.id} onPress={() => onIntent(chip.id)} />
        ))}
      </ScrollView>
      {note ? <Text style={[styles.note, { color: c.textSecondary, fontFamily: typography.body }]}>{note}</Text> : null}
      {travelDigital ? <Text style={[styles.note, { color: c.warning, fontFamily: typography.bodyMedium }]}>Travel mode is on — only books you can open digitally count as readable tonight.</Text> : null}

      {/* A better book you already own */}
      {challenge ? (
        <Pressable onPress={() => open(challenge.workId)} accessibilityRole="button" style={[styles.card, { backgroundColor: c.surface, borderColor: c.warning }]}>
          <Eyebrow>Worth a look</Eyebrow>
          <Text style={[styles.h2, { color: c.textPrimary, fontFamily: typography.display }]}>{challenge.message}</Text>
          <Text style={[styles.body, { color: c.textPrimary, fontFamily: typography.bodySemibold }]}>{challenge.title}</Text>
          <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>{challenge.because}</Text>
        </Pressable>
      ) : null}

      {/* THE DECISION */}
      {decision.primary && top ? (
        <View style={[styles.hero, { backgroundColor: c.surface, borderColor: c.primary }]}>
          <Eyebrow>Your pick</Eyebrow>
          <View style={styles.heroRow}>
            <ComicCover title={top.title} workId={top.workId} size="list" recyclingKey={`pick-${top.workId}`} />
            <View style={styles.flex}>
              <Text numberOfLines={3} style={[styles.h1, { color: c.textPrimary, fontFamily: typography.display }]}>{top.title}</Text>
              <RoleTag entry={top} />
            </View>
          </View>
          <Text style={[styles.headline, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{decision.primary.headline}</Text>
          <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>{decision.primary.explanation}</Text>
          <Text style={[styles.status, { color: c.primary, fontFamily: typography.bodySemibold }]}>{decision.primary.status}</Text>
          <Button onPress={start}>{primaryAction(decision)}</Button>
          {decision.thenNext ? (
            <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>
              Then: <Text style={{ color: c.textPrimary, fontFamily: typography.bodySemibold }}>{decision.thenNext.title}</Text>
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.h2, { color: c.textPrimary, fontFamily: typography.display }]}>Nothing here is left to read.</Text>
          <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>Everything you picked is already finished. You can include rereads below, or pick different books.</Text>
        </View>
      )}

      {decision.closeCall ? (
        <View style={[styles.card, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
          <Text style={[styles.body, { color: c.textPrimary, fontFamily: typography.body }]}>{decision.closeCall}</Text>
        </View>
      ) : null}

      {/* WHY IT BEATS THE OTHERS */}
      {decision.beatsOthers.length ? (
        <>
          <Text style={[styles.h2, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>Why it beats the others</Text>
          {decision.beatsOthers.map((b) => (
            <View key={b.workId} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.body, { color: c.textPrimary, fontFamily: typography.bodySemibold }]}>{b.title}</Text>
              <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>{b.text}</Text>
            </View>
          ))}
        </>
      ) : null}

      {/* YOUR ORDER */}
      {decision.order.length > 1 ? (
        <>
          <Text style={[styles.h2, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>Your order</Text>
          {decision.order.map((e) => (
            <Pressable key={e.workId} onPress={() => open(e.workId)} accessibilityRole="button" style={[styles.orderRow, { borderBottomColor: c.border }]}>
              <Text style={[styles.pos, { color: e.position === 1 ? c.primary : c.textMuted, fontFamily: typography.display }]}>{e.position}</Text>
              <Text numberOfLines={2} style={[styles.orderTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{e.title}</Text>
              <RoleTag entry={e} small />
            </Pressable>
          ))}
        </>
      ) : null}

      {/* ALREADY READ — explained, not ranked */}
      {decision.excluded.length ? (
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Eyebrow>Already read</Eyebrow>
          {decision.excluded.map((e) => (
            <Pressable key={e.workId} onPress={() => open(e.workId)} accessibilityRole="button" style={styles.excludedRow}>
              <Text style={[styles.body, { color: c.textPrimary, fontFamily: typography.bodySemibold }]}>{e.title}</Text>
              <Text style={[styles.note, { color: c.success, fontFamily: typography.bodyMedium }]}>{excludedLine(e)}</Text>
            </Pressable>
          ))}
          <Text style={[styles.note, { color: c.textSecondary, fontFamily: typography.body }]}>
            Not included in your next-read ranking — we keep them here as a reference.
          </Text>
          {hasRereadable(decision) || rereads ? (
            <Button kind="secondary" onPress={onToggleRereads}>{rereads ? 'Stop including rereads' : 'Include rereads'}</Button>
          ) : null}
        </View>
      ) : null}

      {/* WHY THIS ORDER? — the case for and against each */}
      {decision.order.length ? <Text style={[styles.h2, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>Why this order?</Text> : null}
      {decision.order.map((e) => <CandidateCard key={e.workId} entry={e} onOpen={() => open(e.workId)} />)}

      {/* WHAT WOULD CHANGE MY PICK? */}
      {decision.changesAnswer.length ? (
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Eyebrow>What would change my pick?</Eyebrow>
          <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>It depends what you want right now.</Text>
          {decision.changesAnswer.map((a) => (
            <Pressable key={a.label} onPress={() => open(a.workId)} accessibilityRole="button" style={styles.changeRow}>
              <Text style={[styles.changeLabel, { color: c.textMuted, fontFamily: typography.bodySemibold }]}>{a.label.toUpperCase()}</Text>
              <Text style={[styles.body, { color: c.textPrimary, fontFamily: typography.bodySemibold }]}>→ {a.title}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* COMPARE AT A GLANCE — supporting evidence, on request */}
      {decision.order.length > 1 ? (
        <>
          <Button kind="secondary" onPress={() => setGlanceOpen((v) => !v)}>{glanceOpen ? 'Hide comparison' : 'Compare at a glance'}</Button>
          {glanceOpen ? <Glance outcome={outcome} /> : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function RoleTag({ entry, small = false }: { entry: RankedEntry; small?: boolean }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const { label, tone } = roleBadge(entry);
  const tint = tone === 'go' ? c.success : tone === 'wait' ? c.warning : c.textSecondary;
  return (
    <View style={[styles.tag, { borderColor: tint }, small && styles.tagSmall]}>
      <Text style={[styles.tagText, { color: tint, fontFamily: typography.bodySemibold }]}>{label}</Text>
    </View>
  );
}

function CandidateCard({ entry, onOpen }: { entry: RankedEntry; onOpen: () => void }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: entry.position === 1 ? c.primary : c.border }]}>
      <View style={styles.cardHead}>
        <Text style={[styles.pos, { color: entry.position === 1 ? c.primary : c.textMuted, fontFamily: typography.display }]}>#{entry.position}</Text>
        <Text numberOfLines={2} style={[styles.cardTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{entry.title}</Text>
      </View>
      <RoleTag entry={entry} />

      {entry.caseFor.length ? (
        <>
          <Text style={[styles.label, { color: c.textMuted, fontFamily: typography.bodySemibold }]}>THE CASE FOR IT</Text>
          {entry.caseFor.map((t) => <Text key={t} style={[styles.body, { color: c.textPrimary, fontFamily: typography.body }]}>✓ {t}</Text>)}
        </>
      ) : null}

      {entry.caseAgainst.length ? (
        <>
          <Text style={[styles.label, { color: c.textMuted, fontFamily: typography.bodySemibold }]}>{entry.position === 1 ? 'TRADE-OFFS' : 'WHY NOT FIRST?'}</Text>
          {(entry.position === 1 ? entry.caseAgainst : [...entry.whyNotFirst, ...entry.caseAgainst]).map((t) => (
            <Text key={t} style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>• {t}</Text>
          ))}
        </>
      ) : entry.whyNotFirst.length ? (
        <>
          <Text style={[styles.label, { color: c.textMuted, fontFamily: typography.bodySemibold }]}>WHY NOT FIRST?</Text>
          {entry.whyNotFirst.map((t) => <Text key={t} style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>• {t}</Text>)}
        </>
      ) : null}

      <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>
        Best for: <Text style={{ color: c.textPrimary, fontFamily: typography.bodySemibold }}>{entry.bestFor}</Text>
      </Text>
      <Pressable onPress={onOpen} accessibilityRole="button"><Text style={[styles.link, { color: c.primary, fontFamily: typography.bodySemibold }]}>Details  →</Text></Pressable>
    </View>
  );
}

const COL = 132;

function Glance({ outcome }: { outcome: ReadCompareOutcome }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const { decision } = outcome;
  const { rows, uniformNotes } = decision.glance;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      {uniformNotes.map((n) => <Text key={n} style={[styles.note, { color: c.success, fontFamily: typography.bodyMedium }]}>✓ {n}</Text>)}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.glanceRow}>
            <View style={[styles.glanceName]} />
            {decision.order.map((e) => (
              <Text key={e.workId} numberOfLines={2} style={[styles.glanceHead, { width: COL, color: c.textPrimary, fontFamily: typography.bodySemibold }]}>{e.title}</Text>
            ))}
          </View>
          {rows.map((r) => (
            <View key={r.key} style={[styles.glanceRow, { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <Text style={[styles.glanceName, { color: c.textMuted, fontFamily: typography.bodyMedium }]}>{r.name}</Text>
              {decision.order.map((e) => (
                <Text key={e.workId} style={[styles.glanceCell, { width: COL, color: c.textPrimary, fontFamily: typography.body }]}>
                  {r.cells.find((cell) => cell.workId === e.workId)?.label ?? '—'}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 120, gap: space.md },
  flex: { flex: 1, minWidth: 0, gap: 8 },
  back: { fontSize: 16, marginBottom: 4 },
  label: { fontSize: 10, letterSpacing: 1.4, marginTop: 4 },
  chips: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  note: { fontSize: 14, lineHeight: 19 },
  card: { borderWidth: 1, borderRadius: 16, padding: space.md, gap: 8 },
  hero: { borderWidth: 1, borderRadius: 18, padding: space.lg, gap: space.md },
  heroRow: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  h1: { fontSize: 26, lineHeight: 30 },
  h2: { fontSize: 22, lineHeight: 26, marginTop: space.sm },
  headline: { fontSize: 18, lineHeight: 24 },
  body: { fontSize: 14, lineHeight: 21 },
  status: { fontSize: 14 },
  tag: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagSmall: { paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 10, letterSpacing: 1 },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  pos: { fontSize: 22, width: 34 },
  orderTitle: { flex: 1, fontSize: 16 },
  excludedRow: { gap: 2, paddingVertical: 4 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardTitle: { flex: 1, fontSize: 18 },
  link: { fontSize: 14, marginTop: 2 },
  changeRow: { gap: 2, paddingVertical: 6 },
  changeLabel: { fontSize: 10, letterSpacing: 1.4 },
  glanceRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8 },
  glanceName: { width: 104, fontSize: 12 },
  glanceHead: { fontSize: 12, paddingRight: 8 },
  glanceCell: { fontSize: 14, paddingRight: 8 },
});
