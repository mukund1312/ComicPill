// "Meet the characters" on a book's page. Answers "who are these people, and
// do I need to know them?" in the reader's terms — and the default answer is
// no. Explanations are just enough for THIS book; deeper history is a saved
// rabbit hole, never a prerequisite.
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Eyebrow } from '../../ui/primitives';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { CHARACTER_GLOSSARY, WORK_CAST } from '../../lib/data/castData';
import { canContinueReading, meetTheCharacters, type Familiarity, type MeetCharacter } from '../../lib/engines/arc/characters';
import { isSameTopic } from '../../lib/engines/arc/rabbit';
import { listRabbitHoles, loadReaderWorks, saveRabbitHole } from '../../lib/db/queries/arc';

const FAMILIARITY_LABEL: Record<Familiarity, string> = { known: 'Known ✓', some_context: 'Some context', new: 'New' };

export default function MeetCharacters({ workId }: { workId: string }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const cast = WORK_CAST[workId];
  const [tick, setTick] = useState(0);
  const [openName, setOpenName] = useState<string | null>(null);

  const data = useMemo(() => {
    if (!cast) return null;
    const meet = meetTheCharacters(workId, cast, CHARACTER_GLOSSARY, loadReaderWorks());
    return { meet, saved: listRabbitHoles() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId, cast, tick]);

  if (!data || !cast) return null;
  const { meet, saved } = data;
  const hasNew = meet.some((m) => m.familiarity === 'new');

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Eyebrow>Meet the characters</Eyebrow>
      {hasNew ? (
        <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>
          {canContinueReading(meet)
            ? 'You’ll meet some characters you don’t know yet. That’s normal for this series — you don’t need any extra reading to continue.'
            : 'A couple of these matter for this book.'}
        </Text>
      ) : null}
      {meet.map((m) => (
        <CharacterRow
          key={m.name} m={m} open={openName === m.name}
          onToggle={() => setOpenName(openName === m.name ? null : m.name)}
          saved={saved.some((r) => isSameTopic(r.topic, m.name))}
          onSave={() => { saveRabbitHole(m.name, workId, new Date()); setTick((t) => t + 1); }}
        />
      ))}
    </View>
  );
}

function CharacterRow({ m, open, onToggle, saved, onSave }: { m: MeetCharacter; open: boolean; onToggle: () => void; saved: boolean; onSave: () => void }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  return (
    <View style={styles.row}>
      <Pressable onPress={onToggle} accessibilityRole="button" style={styles.rowHead}>
        <Text style={[styles.name, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{m.name}</Text>
        <Text style={[styles.tag, { color: m.familiarity === 'known' ? c.success : m.familiarity === 'new' ? c.primary : c.textSecondary, fontFamily: typography.bodyMedium }]}>
          {FAMILIARITY_LABEL[m.familiarity]}
        </Text>
      </Pressable>
      {open ? (
        <View style={[styles.detail, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
          <Text style={[styles.label, { color: c.textMuted, fontFamily: typography.bodySemibold }]}>WHO ARE THEY?</Text>
          <Text style={[styles.body, { color: c.textPrimary, fontFamily: typography.body }]}>{m.whoAreThey ?? 'No summary yet.'}</Text>
          {m.whyHere ? (
            <>
              <Text style={[styles.label, { color: c.textMuted, fontFamily: typography.bodySemibold }]}>WHY ARE THEY HERE?</Text>
              <Text style={[styles.body, { color: c.textPrimary, fontFamily: typography.body }]}>{m.whyHere}</Text>
            </>
          ) : null}
          <Text style={[styles.label, { color: c.textMuted, fontFamily: typography.bodySemibold }]}>CONTEXT NEEDED</Text>
          <Text style={[styles.body, { color: c.textPrimary, fontFamily: typography.bodySemibold }]}>
            {m.contextNeeded === 'none' ? 'None' : m.contextNeeded === 'helpful' ? 'Helpful, not required' : 'Required'}
          </Text>
          <Button kind="secondary" disabled={saved} onPress={onSave}>{saved ? 'Saved for later ✓' : 'Save as a rabbit hole'}</Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: space.md, gap: 8 },
  body: { fontSize: 14, lineHeight: 19 },
  row: { gap: 6 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  name: { fontSize: 16 },
  tag: { fontSize: 12 },
  detail: { borderWidth: 1, borderRadius: 10, padding: space.md, gap: 6 },
  label: { fontSize: 10, letterSpacing: 1.4, marginTop: 2 },
});
