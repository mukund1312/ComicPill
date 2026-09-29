import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Eyebrow, SectionHeader } from '../../ui/primitives';
import { color, font, radius, space, type } from '../../ui/tokens';
const groups = [
  ['Account', 'Notifications', 'Reading reminders', 'New release alerts'],
  ['Data & privacy', 'Personalized recommendations', 'Anonymous analytics', 'Export my data', 'Clear local data'],
  ['App', 'Appearance', 'Language', 'Currency', 'Accessibility'],
  ['Support', 'Help & feedback', 'About ComicPill'],
];
export default function SettingsScreen() { return <ScrollView style={styles.page} contentContainerStyle={styles.content}><Text onPress={() => router.back()} style={styles.back}>‹ Profile</Text><Text style={styles.title}>Settings</Text><Text style={styles.subtitle}>Quiet controls for the rest of your reading life.</Text>{groups.map(([heading, ...items]) => <View key={heading}><SectionHeader title={heading} />{items.map((item, index) => <Pressable key={item} disabled={item !== 'Help & feedback'} onPress={() => item === 'Help & feedback' && router.push('/feedback')} style={styles.row}><Text style={styles.rowText}>{item}</Text>{index < 2 && heading !== 'Support' ? <View style={styles.toggle}><View style={styles.toggleDot} /></View> : <Text style={styles.chevron}>›</Text>}</Pressable>)}</View>)}<Button kind="destructive" style={{ marginTop: 30 }}>Delete my account</Button></ScrollView>; }
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: color.bg }, content: { padding: space.lg, paddingTop: 60, paddingBottom: 40 }, back: { color: color.muted, fontFamily: font.bodyMedium, marginBottom: 18 }, title: { color: color.text, fontFamily: font.display, fontSize: 34 }, subtitle: { color: color.muted, fontFamily: font.body, fontSize: type.body, marginTop: 6 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border }, rowText: { color: color.text, fontFamily: font.body, fontSize: type.body }, chevron: { color: color.muted, fontSize: 24 }, toggle: { width: 42, height: 24, borderRadius: 12, backgroundColor: color.accent, padding: 3, alignItems: 'flex-end' }, toggleDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: color.text } });
