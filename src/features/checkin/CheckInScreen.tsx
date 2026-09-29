import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCheckIn } from './useCheckIn';
import { ComicCover } from '../../ui/comic';
import { Button, Input, Pill, Progress } from '../../ui/primitives';
import { color, font, radius, space, type } from '../../ui/tokens';

// Expanded from the original 7-item list per the reflection redesign — still
// stored as `tag: {kind: 'genre', value}` events, same as before.
const STAYED_WITH_YOU = [
  'Story', 'Artwork', 'Character', 'Villain', 'Mystery', 'Action', 'Emotion',
  'Worldbuilding', 'Horror', 'Violence', 'Dialogue', 'Ending', 'Ideas / Themes', 'Cosmic Scale',
];

export default function CheckInScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const flow = useCheckIn(id, []);
  const card = flow.currentCard;
  const work = flow.work;
  // Chip selection is local UI state — the event log stays append-only
  // (selecting is a real, immediate write; deselecting just un-highlights,
  // it never retracts the earlier event). Free text is its own field, only
  // written once, when the user moves on from this card.
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');

  if (!work || !card) return <View style={styles.done}><Text style={styles.doneTitle}>Logged.</Text><Text style={styles.doneCopy}>Your next recommendation will be a little more personal.</Text><Button onPress={() => router.replace('/')}>Back to Today</Button></View>;

  const total = flow.cards.length;
  const title = card.kind === 'rating' ? 'How did it feel?' : card.kind === 'chips' ? 'What stayed with you?' : card.kind === 'calibrate' ? `How was the ${card.dimension}?` : 'What sounds good next?';

  function toggleChip(chip: string) {
    if (selectedChips.has(chip)) {
      setSelectedChips((prev) => { const next = new Set(prev); next.delete(chip); return next; });
      return;
    }
    setSelectedChips((prev) => new Set(prev).add(chip));
    flow.answerChip('genre', chip);
  }

  function submitChips() {
    const trimmed = note.trim();
    if (trimmed) flow.answerChip('note', trimmed);
    flow.skip();
  }

  return <ScrollView style={styles.page} contentContainerStyle={styles.content}><View style={styles.top}><Text onPress={() => router.back()} style={styles.cancel}>Cancel</Text><Text style={styles.counter}>{flow.cardIndex + 1} / {total}</Text><Text onPress={flow.skip} style={styles.skip}>Skip</Text></View><Progress value={(flow.cardIndex + 1) / total} /><View style={styles.work}><ComicCover title={work.title} size="list" /><Text numberOfLines={2} ellipsizeMode="tail" style={styles.workTitle}>{work.title}</Text></View><Text style={styles.title}>{title}</Text>{card.kind === 'rating' ? <><Text style={styles.copy}>A clear feeling is enough.</Text><View style={styles.answers}><Button kind="secondary" onPress={() => { flow.answerRating(1); flow.skip(); }}>Not for me</Button><Button kind="secondary" onPress={() => { flow.answerRating(2); flow.skip(); }}>It was okay</Button><Button kind="secondary" onPress={() => { flow.answerRating(3); flow.skip(); }}>Liked it</Button><Button onPress={() => { flow.answerRating(5); flow.skip(); }}>Loved it</Button></View></> : null}{card.kind === 'chips' ? <><Text style={styles.copy}>Pick anything that made this one work—or didn’t. Choose as many as fit.</Text><View style={styles.chips}>{STAYED_WITH_YOU.map((chip) => <Pill key={chip} label={chip} active={selectedChips.has(chip)} onPress={() => toggleChip(chip)} />)}</View><Text style={styles.noteLabel}>Something else?</Text><Input placeholder="Type anything..." value={note} onChangeText={setNote} /><Button style={{ marginTop: 16 }} onPress={submitChips}>Next  →</Button></> : null}{card.kind === 'calibrate' ? <><Text style={styles.copy}>A small calibration makes tomorrow’s pick better.</Text><View style={styles.answers}><Button kind="secondary" onPress={() => flow.answerCalibration(card.dimension, 'too_little')}>Too little</Button><Button onPress={() => flow.answerCalibration(card.dimension, 'just_right')}>Just right</Button><Button kind="secondary" onPress={() => flow.answerCalibration(card.dimension, 'too_much')}>Too much</Button></View></> : null}{card.kind === 'appetite' ? <><Text style={styles.copy}>{flow.appetiteLine ?? 'Set the direction for what comes next.'}</Text><View style={styles.answers}><Button kind="secondary" onPress={() => flow.answerAppetite('more')}>More like this</Button><Button kind="secondary" onPress={() => flow.answerAppetite('mix')}>Mix it up</Button><Button onPress={() => flow.answerAppetite('new')}>Something new</Button></View></> : null}</ScrollView>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: color.bg }, content: { padding: space.lg, paddingTop: 60, minHeight: '100%', justifyContent: 'flex-start' }, top: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }, cancel: { color: color.muted, fontFamily: font.bodyMedium }, counter: { color: color.text, fontFamily: font.bodySemibold, fontSize: type.caption }, skip: { color: color.accent, fontFamily: font.bodySemibold }, work: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 34 }, workTitle: { color: color.muted, fontFamily: font.displayMedium, fontSize: type.subtitle, flex: 1 }, title: { color: color.text, fontFamily: font.display, fontSize: 34, lineHeight: 40, marginTop: 30 }, copy: { color: color.muted, fontFamily: font.body, fontSize: type.body, lineHeight: 23, marginTop: 9, marginBottom: 26 }, answers: { gap: 10, marginTop: 6 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }, noteLabel: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.caption, marginBottom: 8 }, done: { flex: 1, padding: 28, backgroundColor: color.bg, justifyContent: 'center', gap: 12 }, doneTitle: { color: color.text, fontFamily: font.display, fontSize: 40 }, doneCopy: { color: color.muted, fontFamily: font.body, fontSize: type.body, lineHeight: 23, marginBottom: 10 } });
