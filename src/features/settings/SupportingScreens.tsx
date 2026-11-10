import { StyleSheet, Text, View } from 'react-native';
import { SectionHeader } from '../../ui/primitives';
import { SettingsPage } from '../../ui/SettingsPage';
import { useAppearance } from '../../ui/theme';
import { radius, space, type } from '../../ui/tokens';
import photoSources from '../../../docs/creator-photo-sources.json';

/** Where the information ComicPill shows comes from. Plain facts, nothing to tap. */
const SOURCES: Array<[string, string]> = [
  ['Built-in catalog', 'Titles, creators, characters and reading orders that ship with the app, checked against publisher data.'],
  ['Your comic files', 'Title, series, issue and writer read from the ComicInfo.xml inside a .cbz or .cbr, when the file has one.'],
  ['Your own servers', 'Comics and details from a Komga, Kavita or other OPDS server you add yourself.'],
  ['Online lookup', 'Only when you search for a comic to add: Open Library, and Comic Vine if you have entered your own key. Only the words you search for are sent.'],
  ['Cover art', 'Covers come from your own files and servers first, then from the catalog.'],
];

export function SourcesScreen() {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const photos = Object.values(photoSources as Record<string, { name: string; author: string; licence: string }>);
  return (
    <SettingsPage title="Sources & metadata" subtitle="ComicPill shows its sources so you know where information comes from.">
      <SectionHeader title="Where details come from" />
      <View style={[styles.rows, { backgroundColor: c.surface, borderColor: c.border }]}>
        {SOURCES.map(([label, detail]) => (
          <View key={label} style={[styles.row, { borderBottomColor: c.border }]}>
            <Text style={[styles.rowTitle, { color: c.textPrimary, fontFamily: typography.bodySemibold }]}>{label}</Text>
            <Text style={[styles.rowText, { color: c.textSecondary, fontFamily: typography.body }]}>{detail}</Text>
          </View>
        ))}
      </View>
      <SectionHeader title="How we make decisions" />
      <Text style={[styles.copy, { color: c.textSecondary, fontFamily: typography.body }]}>Reading-order context comes from confirmed official and third-party sources. ComicPill’s verdicts are personal interpretations, not metadata facts.</Text>
      <SectionHeader title="Creator photos" />
      <Text style={[styles.copy, { color: c.textSecondary, fontFamily: typography.body }]}>Portraits of artists and writers come from Wikimedia Commons under free licences. Credits:</Text>
      <View style={[styles.rows, { backgroundColor: c.surface, borderColor: c.border, marginTop: space.sm }]}>
        {photos.map((p) => (
          <View key={p.name} style={[styles.row, { borderBottomColor: c.border }]}>
            <Text style={[styles.rowText, { color: c.textPrimary, fontFamily: typography.body }]}>{`${p.name} — ${p.author.slice(0, 40)} · ${p.licence}`}</Text>
          </View>
        ))}
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  rows: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  row: { paddingHorizontal: 14, paddingVertical: 12, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTitle: { fontSize: type.body },
  rowText: { fontSize: type.caption, lineHeight: 18 },
  copy: { fontSize: type.body, lineHeight: 23, marginTop: 8 },
});
