import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useFeedback } from './useFeedback';
import { Button, EmptyState, Pill } from '../../ui/primitives';
import { color, font, radius, space, type } from '../../ui/tokens';
import type { FeedbackCategory } from '../../lib/types/domain';

const CATEGORIES: Array<[FeedbackCategory, string]> = [['bug', 'Bug'], ['idea', 'Idea'], ['other', 'Other']];

export default function FeedbackScreen() {
  const feedback = useFeedback();
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [screen, setScreen] = useState('');
  const [copied, setCopied] = useState(false);

  const send = () => {
    feedback.submit(category, message, screen.trim() || null);
    setMessage('');
    setScreen('');
  };

  const copyAll = async () => {
    await Clipboard.setStringAsync(feedback.exportText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text onPress={() => router.back()} style={styles.back}>‹ Settings</Text>
      <Text style={styles.title}>Help &amp; feedback</Text>
      <Text style={styles.subtitle}>
        Logged on your device only — nothing is sent anywhere automatically.
        Use &quot;Copy all&quot; below to hand a full report to the dev directly.
      </Text>

      <View style={styles.form}>
        <View style={styles.pills}>{CATEGORIES.map(([id, label]) => <Pill key={id} label={label} active={category === id} onPress={() => setCategory(id)} />)}</View>
        <TextInput
          placeholder="What went wrong, or what would help?"
          placeholderTextColor={color.faint}
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={4}
          style={styles.textarea}
        />
        <TextInput
          placeholder="Which screen (optional)"
          placeholderTextColor={color.faint}
          value={screen}
          onChangeText={setScreen}
          style={styles.input}
        />
        <Button disabled={!message.trim()} style={{ marginTop: space.md }} onPress={send}>Log it</Button>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Your log ({feedback.entries.length})</Text>
        {feedback.entries.length ? <Pressable onPress={copyAll}><Text style={styles.copyAction}>{copied ? 'Copied ✓' : 'Copy all'}</Text></Pressable> : null}
      </View>

      {feedback.entries.length === 0 ? (
        <EmptyState mark="◇" title="Nothing logged yet" copy="Found something odd? Log it here as you go, then copy the whole list to send over." />
      ) : (
        feedback.entries.map((entry) => (
          <View key={entry.id} style={styles.entry}>
            <View style={styles.entryHeader}>
              <Text style={styles.entryCategory}>{entry.category.toUpperCase()}{entry.screen ? ` · ${entry.screen}` : ''}</Text>
              <Pressable onPress={() => feedback.remove(entry.id)}><Text style={styles.entryDelete}>Remove</Text></Pressable>
            </View>
            <Text style={styles.entryMessage}>{entry.message}</Text>
            <Text style={styles.entryDate}>{new Date(entry.createdAt).toLocaleString('en-IN')}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.lg, paddingTop: 60, paddingBottom: 60 },
  back: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.body, marginBottom: 18 },
  title: { color: color.text, fontFamily: font.display, fontSize: 34 },
  subtitle: { color: color.muted, fontFamily: font.body, fontSize: type.body, lineHeight: 22, marginTop: 8 },
  form: { marginTop: space.xl, gap: space.sm },
  pills: { flexDirection: 'row', gap: space.sm },
  textarea: { minHeight: 96, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, borderRadius: radius.md, color: color.text, fontFamily: font.body, fontSize: type.body, padding: 14, textAlignVertical: 'top' },
  input: { minHeight: 50, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, borderRadius: radius.md, color: color.text, fontFamily: font.body, paddingHorizontal: 14, fontSize: type.body },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: space.xxl, marginBottom: space.md },
  listTitle: { color: color.text, fontFamily: font.displayMedium, fontSize: type.title },
  copyAction: { color: color.accent, fontFamily: font.bodySemibold, fontSize: type.caption },
  entry: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, borderRadius: radius.md, padding: space.md, marginBottom: space.sm },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  entryCategory: { color: color.accent, fontFamily: font.bodySemibold, fontSize: 11, letterSpacing: 0.5 },
  entryDelete: { color: color.faint, fontFamily: font.bodyMedium, fontSize: 11 },
  entryMessage: { color: color.text, fontFamily: font.body, fontSize: type.body, lineHeight: 21, marginTop: 8 },
  entryDate: { color: color.faint, fontFamily: font.body, fontSize: 11, marginTop: 8 },
});
