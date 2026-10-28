import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Button, Pill } from '../../ui/primitives';
import { ComicCover } from '../../ui/comic';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { searchWorks } from '../../lib/db/queries/search';
import { PRINTINGS, validateManual, type ManualInput, type Printing } from '../../lib/scan/manual';
import type { ScanItem, Selection } from '../../lib/scan/session';

type Mode = 'find' | 'manual';

/**
 * Fix one result without leaving the review: search the catalog, pick another candidate, describe a comic the catalog doesn't have, or set the
 * reader's own cover. The spine picture stays as it was; nothing here changes the catalog.
 */
export function EditMatchSheet({ item, number, onClose, onChoose, onCover, onExclude }: {
  item: ScanItem; number: number; onClose: () => void; onChoose: (s: Selection) => void; onCover: (uri: string | null) => void; onExclude: (excluded: boolean) => void;
}) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const [mode, setMode] = useState<Mode>('find');
  const [query, setQuery] = useState('');
  const results = useMemo(() => (query.trim() ? searchWorks(query, 25).map((r) => ({ id: r.workId, title: r.title, creators: r.creators })) : item.candidates.map((cd) => ({ id: cd.id, title: cd.title, creators: [] as string[], note: cd.reasons[0] }))), [query, item.candidates]);
  const [form, setForm] = useState<ManualInput>({ title: item.read.title, volume: item.read.volume?.replace(/^Vol\.\s*/i, '') ?? '', writer: item.read.creators[0] ?? '', printing: 'trade_paperback', format: 'physical' });
  const [errors, setErrors] = useState<Partial<Record<keyof ManualInput, string>>>({});
  const set = (k: keyof ManualInput, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    const r = validateManual({ ...form, volume: form.volume ? `Vol. ${form.volume.replace(/^Vol\.\s*/i, '')}` : '' });
    if (!r.ok) { setErrors(r.errors); return; }
    onChoose({ kind: 'custom', comic: r.value });
  };
  const pickCover = async (from: 'photos' | 'files') => {
    if (from === 'photos') {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [2, 3], quality: 1 });
      if (!r.canceled && r.assets?.[0]) onCover(r.assets[0].uri);
    } else {
      const r = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (!r.canceled && r.assets?.[0]) onCover(r.assets[0].uri);
    }
  };
  const field = (k: keyof ManualInput, label: string, props: { placeholder?: string; keyboardType?: 'default' | 'numeric' } = {}) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: c.textMuted, fontFamily: typography.bodyMedium }]}>{label}</Text>
      <TextInput value={(form[k] as string | undefined) ?? ''} onChangeText={(v) => set(k, v)} placeholder={props.placeholder} placeholderTextColor={c.textMuted} keyboardType={props.keyboardType} autoCapitalize="words"
        style={[styles.input, { color: c.textPrimary, borderColor: errors[k] ? c.destructive : c.border, backgroundColor: c.surface, fontFamily: typography.body }]} accessibilityLabel={label} />
      {errors[k] ? <Text style={[styles.err, { color: c.destructive }]}>{errors[k]}</Text> : null}
    </View>
  );

  const selectedWorkId = item.selected?.kind === 'catalog' ? item.selected.workId : undefined;
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.page, { backgroundColor: c.background }]}>
        <View style={styles.bar}>
          <Text style={[styles.title, { color: c.textPrimary, fontFamily: typography.display }]}>Book {number}</Text>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={onClose}><Text style={[styles.done, { color: c.primary, fontFamily: typography.bodySemibold }]}>Done</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.row}>
            {item.cropUri ? <Image source={{ uri: item.cropUri }} style={[styles.spine, { backgroundColor: c.surfaceRaised }]} contentFit="cover" /> : null}
            <View style={styles.flex}>
              <Text style={[styles.label, { color: c.textMuted, fontFamily: typography.bodyMedium }]}>What the scan read</Text>
              <Text style={[styles.read, { color: c.textPrimary, fontFamily: typography.body }]}>{item.extractedText.join(' · ') || 'Nothing readable on this spine.'}</Text>
              <Text style={[styles.label, { color: c.textMuted, fontFamily: typography.bodyMedium, marginTop: space.sm }]}>Currently</Text>
              <Text style={[styles.read, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{item.selected ? (item.selected.kind === 'catalog' ? item.selected.title : item.selected.comic.title) : 'No match yet'}</Text>
            </View>
          </View>

          <View style={styles.pills}>
            <Pill label="Find in catalog" active={mode === 'find'} onPress={() => setMode('find')} />
            <Pill label="Add it myself" active={mode === 'manual'} onPress={() => setMode('manual')} />
          </View>

          {mode === 'find' ? (
            <View style={styles.gap}>
              <TextInput value={query} onChangeText={setQuery} placeholder="Search title, series, creator…" placeholderTextColor={c.textMuted} autoCorrect={false}
                style={[styles.input, { color: c.textPrimary, borderColor: c.border, backgroundColor: c.surface, fontFamily: typography.body }]} accessibilityLabel="Search the catalog" />
              <Text style={[styles.label, { color: c.textMuted, fontFamily: typography.bodyMedium }]}>{query.trim() ? 'Results' : item.candidates.length ? 'Best guesses from the scan' : 'Type to search. Nothing close was found on the spine.'}</Text>
              {results.map((r) => (
                <Pressable key={r.id} accessibilityRole="button" onPress={() => onChoose({ kind: 'catalog', workId: r.id, title: r.title })} style={[styles.result, { borderColor: r.id === selectedWorkId ? c.primary : c.border, backgroundColor: c.surface }]}>
                  <ComicCover title={r.title} workId={r.id} size="tiny" recyclingKey={`edit-${r.id}`} />
                  <View style={styles.flex}>
                    <Text numberOfLines={2} style={[styles.read, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{r.title}</Text>
                    {r.creators.length ? <Text numberOfLines={1} style={[styles.label, { color: c.textMuted, fontFamily: typography.body }]}>{r.creators.slice(0, 3).join(', ')}</Text> : null}
                  </View>
                  <Text style={[styles.pick, { color: c.primary, fontFamily: typography.bodySemibold }]}>{r.id === selectedWorkId ? 'Chosen' : 'Choose'}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.gap}>
              <Text style={[styles.label, { color: c.textMuted, fontFamily: typography.body }]}>Only the title is needed. The rest can be added later. This comic stays in your own library; it isn’t shared.</Text>
              {field('title', 'Title *')}
              {field('series', 'Series')}
              {field('volume', 'Volume number', { keyboardType: 'numeric' })}
              {field('publisher', 'Publisher')}
              {field('writer', 'Writer')}
              {field('artist', 'Artist')}
              {field('year', 'Publication year', { keyboardType: 'numeric' })}
              <Text style={[styles.label, { color: c.textMuted, fontFamily: typography.bodyMedium }]}>Format</Text>
              <View style={styles.pills}>{PRINTINGS.map((p) => <Pill key={p.key} label={p.label} active={(form.printing ?? 'trade_paperback') === p.key} onPress={() => set('printing', p.key as Printing)} />)}</View>
              {field('isbn', 'ISBN (optional)')}
              {field('pages', 'Pages (optional)', { keyboardType: 'numeric' })}
              <Button onPress={save}>Use this comic</Button>
            </View>
          )}

          <Text style={[styles.section, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>Cover</Text>
          <View style={styles.row}>
            {item.customCoverUri ? <Image source={{ uri: item.customCoverUri }} style={styles.cover} contentFit="cover" /> : <ComicCover title={item.selected ? (item.selected.kind === 'catalog' ? item.selected.title : item.selected.comic.title) : item.read.title || 'Unknown'} workId={selectedWorkId} size="list" recyclingKey={`edit-cover-${item.scanId}`} />}
            <View style={[styles.flex, { gap: space.sm }]}>
              <Text style={[styles.label, { color: c.textMuted, fontFamily: typography.body }]}>
                {item.customCoverUri ? 'Your own cover. It only changes how this comic looks in your library.' : selectedWorkId ? 'The catalog cover. You can use your own instead if your edition looks different.' : 'No cover yet. Add your own, or leave the placeholder.'}
              </Text>
              <View style={styles.pills}>
                <Pill label="From photos" active={false} onPress={() => { void pickCover('photos'); }} />
                <Pill label="From Files" active={false} onPress={() => { void pickCover('files'); }} />
                {item.customCoverUri ? <Pill label="Remove mine" active={false} onPress={() => onCover(null)} /> : null}
              </View>
            </View>
          </View>

          <Button kind="ghost" onPress={() => { onExclude(item.status !== 'excluded'); onClose(); }}>{item.status === 'excluded' ? 'Include this book again' : 'Leave this book out'}</Button>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space.lg },
  title: { fontSize: 22 }, done: { fontSize: 16 },
  body: { padding: space.lg, paddingTop: 0, gap: space.md, paddingBottom: 80 },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  flex: { flex: 1, minWidth: 0 },
  gap: { gap: space.md },
  spine: { width: 54, height: 150, borderRadius: 8 },
  cover: { width: 58, height: 86, borderRadius: 9 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { gap: 4 },
  label: { fontSize: 12, lineHeight: 17 },
  read: { fontSize: 14, lineHeight: 20 },
  section: { fontSize: 17, marginTop: space.md },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  err: { fontSize: 12 },
  result: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderRadius: 14, padding: space.md },
  pick: { fontSize: 14 },
});
