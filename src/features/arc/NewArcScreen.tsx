// "Build me an arc". The reader can just say what they want in their own
// words; the request is interpreted (by the model when an endpoint is
// configured, by an offline word-matcher otherwise), mapped onto a journey
// ComicPill actually has, and shown back for confirmation before anything is
// saved. Picking a journey by hand stays available underneath.
//
// Recommended depth is the default because ComicPill exists to remove
// reading-order overload, not to hand someone 200 comics.
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { AppShell } from '../../ui/AppShell';
import { Button, Eyebrow, Pill } from '../../ui/primitives';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { ARC_TEMPLATES } from '../../lib/engines/arc/templates';
import type { ArcDepth } from '../../lib/engines/arc/types';
import { useSettings } from '../../lib/state/settings';
import { useAiConfig } from '../../lib/ai/useAiConfig';
import { createUserArc, loadArcLibrary, loadWorkTitles } from '../../lib/db/queries/arc';
import { upsertLibraryEntry } from '../../lib/db/queries/library';
import { resolveProposals, type LibraryProposal } from '../../lib/intent/match';
import { intentOptionsFromEnv, interpretReadingIntent, type InterpretResult } from '../../lib/intent/client';
import { resolveArc, type ResolvedArc } from '../../lib/intent/resolve';
import { describeResult } from './compose';
import { DEPTHS, depthCounts } from './useArc';

const TEMPLATES = Object.values(ARC_TEMPLATES);

const KIND_LABEL: Record<string, string> = {
  character_life_arc: 'Character life arc', family_arc: 'Family arc', legacy_arc: 'Legacy arc',
  story_arc: 'Story arc', creator_run: 'Creator run', event_path: 'Event path', universe_path: 'Universe path',
  origin_path: 'Origin path', relationship_arc: 'Relationship arc', villain_arc: 'Villain arc',
  transformation_arc: 'Transformation arc', custom_goal: 'Custom goal',
};

interface Interpreted { text: string; result: InterpretResult; resolved: ResolvedArc; proposals: LibraryProposal[] }

export default function NewArcScreen({ initialTemplateKey }: { initialTemplateKey?: string }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;

  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [interpreted, setInterpreted] = useState<Interpreted | null>(null);

  const [templateKey, setTemplateKey] = useState(initialTemplateKey ?? TEMPLATES[0].key);
  const defaultDepth = useSettings((s) => s.defaultJourneyDepth);
  const ai = useAiConfig();
  const [depth, setDepth] = useState<ArcDepth>(defaultDepth);
  const [goalText, setGoalText] = useState('');
  const [editingGoal, setEditingGoal] = useState(false);

  const template = ARC_TEMPLATES[templateKey];
  const counts = depthCounts(templateKey);
  const view = interpreted ? describeResult(interpreted.resolved, interpreted.result.intent, interpreted.result.source, { aiError: interpreted.result.aiError, hasAssistant: !!ai.config || !!intentOptionsFromEnv().endpoint }) : null;

  const interpret = async () => {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    try {
      const result = await interpretReadingIntent(message, { ...intentOptionsFromEnv(), ai: ai.config });
      const resolved = resolveArc(result.intent);
      const lib = loadArcLibrary();
      const titles = [...loadWorkTitles()].map(([id, title]) => ({ id, title }));
      const proposals = resolveProposals(result.intent.proposedLibraryUpdates, titles, (id) => lib.get(id)?.status ?? 'none');
      setInterpreted({ text: message, result, resolved, proposals });
      if (resolved.kind === 'match') {
        setTemplateKey(resolved.templateKey);
        setDepth(resolved.depth);
        setGoalText(ARC_TEMPLATES[resolved.templateKey].goal);
        setEditingGoal(false);
      }
    } finally {
      setBusy(false);
    }
  };

  // Confirm-first: a message can imply a state change ("I finished it"), but
  // nothing is written until the reader says yes.
  const answerProposal = (p: LibraryProposal, accept: boolean) => {
    if (accept) {
      upsertLibraryEntry(p.workId, p.action === 'mark_finished'
        ? { status: 'done', finishedAt: new Date().toISOString() }
        : { status: 'reading' });
    }
    setInterpreted((cur) => cur && { ...cur, proposals: cur.proposals.filter((x) => x !== p) });
  };

  const start = () => {
    const matched = interpreted?.resolved.kind === 'match';
    const arc = createUserArc({
      templateKey,
      goalText: (matched && goalText.trim()) || template.goal,
      depth,
      // Keep what the reader said and how it was read, so "Edit goal" can
      // round-trip and later features can see the friction/feedback signals.
      intent: matched && interpreted ? { sourceText: interpreted.text, source: interpreted.result.source, intent: interpreted.result.intent } : null,
      now: new Date(),
    });
    router.replace(`/arc/${arc.id}`);
  };

  const matched = interpreted?.resolved.kind === 'match';

  return (
    <AppShell active="paths" title="Build me an arc">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text onPress={() => router.back()} style={[styles.back, { color: c.textSecondary, fontFamily: typography.bodyMedium }]}>‹ Paths</Text>
        <Text style={[styles.lead, { color: c.textPrimary, fontFamily: typography.display }]}>Tell me what you want to read.</Text>
        <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>
          Say it however it comes out — what you’re reading, what’s confusing, where you want to end up. I’ll turn it into a curated journey built around what you own and have read.
        </Text>

        <TextInput
          accessibilityLabel="What do you want to read?"
          multiline
          value={text}
          onChangeText={setText}
          placeholder="e.g. I want Batman from his origin through Robin, Nightwing and Red Hood…"
          placeholderTextColor={c.textMuted}
          style={[styles.textarea, { color: c.textPrimary, borderColor: c.border, backgroundColor: c.surfaceRaised, fontFamily: typography.body }]}
        />
        <Button onPress={interpret} disabled={!text.trim() || busy}>{busy ? 'Reading your message…' : 'Build my journey'}</Button>

        {view ? (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: matched ? c.primary : c.border }]}>
            <Text style={[styles.cardTitle, { color: c.textPrimary, fontFamily: typography.display }]}>{view.headline}</Text>

            {view.sourceNote ? <Text style={[styles.note, { color: c.warning, fontFamily: typography.bodyMedium }]}>{view.sourceNote}</Text> : null}

            {view.outline.length ? (
              <Text style={[styles.body, { color: c.textPrimary, fontFamily: typography.bodyMedium }]}>{view.outline.join('  →  ')}</Text>
            ) : null}

            {view.focusChips.length ? (
              <View style={styles.chips}>
                {view.focusChips.map((f) => <Pill key={f} label={`✓ ${f}`} />)}
              </View>
            ) : null}

            {view.notCovered.length ? (
              <Text style={[styles.note, { color: c.textSecondary, fontFamily: typography.body }]}>
                Not specifically covered yet: {view.notCovered.join(', ')}.
              </Text>
            ) : null}

            {view.reassurance ? (
              <View style={[styles.reassure, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
                <Text style={[styles.body, { color: c.textPrimary, fontFamily: typography.body }]}>{view.reassurance}</Text>
              </View>
            ) : null}

            {interpreted?.proposals.map((p) => (
              <View key={`${p.workId}:${p.action}`} style={[styles.reassure, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
                <Text style={[styles.body, { color: c.textPrimary, fontFamily: typography.body }]}>{p.prompt}</Text>
                <View style={styles.chips}>
                  <Button style={styles.flexBtn} onPress={() => answerProposal(p, true)}>Yes</Button>
                  <Button kind="secondary" style={styles.flexBtn} onPress={() => answerProposal(p, false)}>Not yet</Button>
                </View>
              </View>
            ))}

            {view.worthChecking.length && matched ? (
              <View style={styles.check}>
                <Eyebrow>Worth checking</Eyebrow>
                {view.worthChecking.map((w) => (
                  <Text key={w} style={[styles.note, { color: c.textSecondary, fontFamily: typography.body }]}>• {w}</Text>
                ))}
              </View>
            ) : null}

            {interpreted?.resolved.kind === 'no_template' ? (
              <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>
                Right now I can build: {interpreted.resolved.available.map((a) => a.title).join('; ')}. You can pick one below.
              </Text>
            ) : null}

            {matched ? (
              <>
                <Eyebrow>Your goal</Eyebrow>
                {editingGoal ? (
                  <TextInput
                    multiline
                    value={goalText}
                    onChangeText={setGoalText}
                    style={[styles.textarea, { color: c.textPrimary, borderColor: c.primary, backgroundColor: c.surfaceRaised, fontFamily: typography.body }]}
                  />
                ) : (
                  <Text style={[styles.body, { color: c.textPrimary, fontFamily: typography.body }]}>{goalText}</Text>
                )}
                <Button kind="secondary" onPress={() => setEditingGoal((v) => !v)}>{editingGoal ? 'Done' : 'Edit goal'}</Button>
              </>
            ) : null}
          </View>
        ) : null}

        {matched || !interpreted ? (
          <>
            <Text style={[styles.section, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>How deep do you want to go?</Text>
            {DEPTHS.map((d) => (
              <View key={d.id} style={[styles.depth, { backgroundColor: c.surface, borderColor: depth === d.id ? c.primary : c.border }]}>
                <View style={styles.depthHead}>
                  <Pill label={d.label} active={depth === d.id} onPress={() => setDepth(d.id)} />
                  <Text style={[styles.count, { color: c.textSecondary, fontFamily: typography.bodyMedium }]}>{counts[d.id]} books</Text>
                </View>
                <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>{d.blurb}</Text>
              </View>
            ))}
          </>
        ) : null}

        <Text style={[styles.section, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>
          {matched ? 'Or choose a different journey' : 'Or pick a journey yourself'}
        </Text>
        {TEMPLATES.map((t) => (
          <View key={t.key} style={[styles.card, { backgroundColor: c.surface, borderColor: t.key === templateKey ? c.primary : c.border }]}>
            <Eyebrow>{t.kinds.map((k) => KIND_LABEL[k] ?? k).join(' · ')}</Eyebrow>
            <Text style={[styles.cardTitle, { color: c.textPrimary, fontFamily: typography.display }]}>{t.title}</Text>
            <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>{t.goal}</Text>
            {t.key !== templateKey ? <Button kind="secondary" onPress={() => { setTemplateKey(t.key); setGoalText(t.goal); }}>Choose this journey</Button> : null}
          </View>
        ))}

        <Button onPress={start}>Start this journey</Button>
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 120, gap: space.md },
  back: { fontSize: 16, marginBottom: 8 },
  lead: { fontSize: 28, lineHeight: 34 },
  body: { fontSize: 14, lineHeight: 21 },
  note: { fontSize: 13, lineHeight: 19 },
  textarea: { minHeight: 110, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, lineHeight: 22, textAlignVertical: 'top' },
  card: { borderWidth: 1, borderRadius: 18, padding: space.lg, gap: space.sm },
  cardTitle: { fontSize: 20, lineHeight: 27 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reassure: { borderWidth: 1, borderRadius: 12, padding: space.md, gap: space.sm },
  flexBtn: { flex: 1 },
  check: { gap: 4 },
  section: { fontSize: 19, marginTop: space.md },
  depth: { borderWidth: 1, borderRadius: 14, padding: space.md, gap: 8 },
  depthHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { fontSize: 13 },
});
