import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useFeedback } from './useFeedback';
import { Button, EmptyState, Pill } from '../../ui/primitives';
import { font, radius, space, type } from '../../ui/tokens';
import { useThemed, type Palette } from '../../ui/theme';
import type { FeedbackCategory } from '../../lib/types/domain';
import { SUPPORT_EMAIL, mailtoLink } from '../../lib/support';
import { feedback as haptics } from '../../lib/platform/feedback';

const CATEGORIES: Array<[FeedbackCategory, string]> = [['bug', 'Bug'], ['idea', 'Idea'], ['other', 'Other']];

export default function FeedbackScreen() {
  const { color, styles } = useThemed(makeStyles);
  const feedback = useFeedback();
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [screen, setScreen] = useState('');
  const [copied, setCopied] = useState(false);

  // What the developer needs to reproduce it, added under every email.
  const deviceLine = () => `ComicPill ${Constants.expoConfig?.version ?? '?'} · ${Platform.OS} ${String(Platform.Version)}`;
  /** Opens the phone's email app, filled in. Without one, the address and the text are copied instead so nothing is lost. */
  const email = async (subject: string, body: string) => {
    const full = `${body}\n\n—\n${deviceLine()}`;
    try {
      await Linking.openURL(mailtoLink(SUPPORT_EMAIL, subject, full));
      return true;
    } catch {
      await Clipboard.setStringAsync(`To: ${SUPPORT_EMAIL}\nSubject: ${subject}\n\n${full}`);
      Alert.alert('No email app found', `The message is copied. Paste it into any app and send it to ${SUPPORT_EMAIL}.`);
      return false;
    }
  };
  const label = CATEGORIES.find(([id]) => id === category)?.[1] ?? 'Feedback';
  const sendNow = async () => {
    const text = message.trim();
    if (!text) return;
    // It is kept in the log too, so it isn't lost if the email is never sent.
    feedback.submit(category, text, screen.trim() || null);
    haptics.success();
    await email(`ComicPill ${label.toLowerCase()}${screen.trim() ? ` · ${screen.trim()}` : ''}`, text);
    setMessage(''); setScreen('');
  };
  const saveForLater = () => {
    feedback.submit(category, message, screen.trim() || null);
    haptics.success();
    setMessage('');
    setScreen('');
  };
  const emailAll = () => { void email(`ComicPill feedback (${feedback.entries.length})`, feedback.exportText()); };

  const copyAll = async () => {
    await Clipboard.setStringAsync(feedback.exportText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text onPress={() => router.back()} style={styles.back}>‹ Settings</Text>
      <Text style={styles.title}>Help &amp; feedback</Text>
      <Text style={styles.subtitle}>
        Tell us what went wrong or what would help. “Email it” opens your email app with the message ready to send to {SUPPORT_EMAIL}. Nothing is sent until you press send there.
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
        <Button disabled={!message.trim()} style={{ marginTop: space.md }} onPress={() => { void sendNow(); }}>Email it</Button>
        <Button kind="ghost" disabled={!message.trim()} onPress={saveForLater}>Save for later</Button>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Saved notes ({feedback.entries.length})</Text>
        {feedback.entries.length ? (
          <View style={styles.listActions}>
            <Pressable accessibilityRole="button" onPress={emailAll} hitSlop={8}><Text style={styles.copyAction}>Email all</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={copyAll} hitSlop={8}><Text style={styles.copyAction}>{copied ? 'Copied ✓' : 'Copy all'}</Text></Pressable>
          </View>
        ) : null}
      </View>

      {feedback.entries.length === 0 ? (
        <EmptyState mark="◇" title="Nothing logged yet" copy="Found something odd but no time to write an email? Save it for later, then send them all at once." />
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
    </SafeAreaView>
  );
}

const makeStyles = (color: Palette) => StyleSheet.create({
  page: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.lg, paddingTop: space.lg, paddingBottom: 60 },
  back: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.body, marginBottom: 18 },
  title: { color: color.text, fontFamily: font.display, fontSize: 34 },
  subtitle: { color: color.muted, fontFamily: font.body, fontSize: type.body, lineHeight: 22, marginTop: 8 },
  form: { marginTop: space.xl, gap: space.sm },
  pills: { flexDirection: 'row', gap: space.sm },
  textarea: { minHeight: 96, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, borderRadius: radius.md, color: color.text, fontFamily: font.body, fontSize: type.body, padding: 14, textAlignVertical: 'top' },
  input: { minHeight: 50, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, borderRadius: radius.md, color: color.text, fontFamily: font.body, paddingHorizontal: 14, fontSize: type.body },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: space.xxl, marginBottom: space.md },
  listTitle: { color: color.text, fontFamily: font.displayMedium, fontSize: type.title },
  listActions: { flexDirection: 'row', gap: space.lg },
  copyAction: { color: color.accent, fontFamily: font.bodySemibold, fontSize: type.caption },
  entry: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, borderRadius: radius.md, padding: space.md, marginBottom: space.sm },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  entryCategory: { color: color.accent, fontFamily: font.bodySemibold, fontSize: 11, letterSpacing: 0.5 },
  entryDelete: { color: color.faint, fontFamily: font.bodyMedium, fontSize: 11 },
  entryMessage: { color: color.text, fontFamily: font.body, fontSize: type.body, lineHeight: 21, marginTop: 8 },
  entryDate: { color: color.faint, fontFamily: font.body, fontSize: 11, marginTop: 8 },
});
