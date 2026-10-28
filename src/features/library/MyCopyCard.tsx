import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Eyebrow, Pill } from '../../ui/primitives';
import { color, font, radius, space, type } from '../../ui/tokens';
import { getMyCopy, saveMyCopy, type MyCopy } from '../../lib/db/queries/myCopy';
import type { ReadStatus } from '../../lib/types/domain';
import { feedback } from '../../lib/platform/feedback';

const STATUSES: { key: ReadStatus; label: string }[] = [{ key: 'none', label: 'Not started' }, { key: 'reading', label: 'Reading' }, { key: 'done', label: 'Finished' }, { key: 'dropped', label: 'Dropped' }];
const RATING_WORDS = ['', 'Not for me', 'It was okay', 'Liked it', 'Really good', 'Loved it'];

/** What the reader thinks of their own copy: whether they've read it, a star rating, and a comment. Saves as they go. */
export function MyCopyCard({ workId }: { workId: string }) {
  const [copy, setCopy] = useState<MyCopy>(() => getMyCopy(workId));
  const [draft, setDraft] = useState(copy.notes);
  const update = (patch: Partial<MyCopy>) => { saveMyCopy(workId, patch); setCopy((c) => ({ ...c, ...patch })); };

  return (
    <View style={styles.card}>
      <Eyebrow>Your copy</Eyebrow>
      <View style={styles.pills}>
        {STATUSES.map((s) => <Pill key={s.key} label={s.label} active={copy.status === s.key} onPress={() => { feedback.select(); update({ status: s.key }); }} />)}
      </View>
      <View style={styles.stars} accessibilityLabel={copy.rating ? `Rated ${copy.rating} out of 5` : 'Not rated'}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`} hitSlop={6} onPress={() => { feedback.select(); update({ rating: copy.rating === n ? null : n }); }}>
            <Text style={[styles.star, { color: copy.rating && n <= copy.rating ? color.collectGold : color.faint }]}>{copy.rating && n <= copy.rating ? '★' : '☆'}</Text>
          </Pressable>
        ))}
        <Text style={styles.word}>{copy.rating ? RATING_WORDS[copy.rating] : 'Tap to rate'}</Text>
      </View>
      <TextInput
        value={draft} onChangeText={setDraft} onBlur={() => { if (draft.trim() !== copy.notes) update({ notes: draft }); }}
        multiline placeholder="Your thoughts on this one…" placeholderTextColor={color.faint} style={styles.input} accessibilityLabel="Your comment"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, padding: space.lg, gap: space.md, marginBottom: space.lg },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  star: { fontSize: 30 },
  word: { color: color.muted, fontFamily: font.body, fontSize: type.caption, marginLeft: space.sm },
  input: { minHeight: 84, color: color.text, fontFamily: font.body, fontSize: type.body, lineHeight: 22, backgroundColor: color.surface2, borderRadius: radius.md, padding: space.md, textAlignVertical: 'top' },
});
