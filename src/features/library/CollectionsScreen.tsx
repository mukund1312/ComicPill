// Collections: your own groupings of the comics in My Collection (physical or digital). They nest, so “Batman” can hold “Year One” and a handful of comics.
import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router, useFocusEffect } from 'expo-router';
import { AppShell } from '../../ui/AppShell';
import { ComicCover } from '../../ui/comic';
import { EmptyState, Input } from '../../ui/primitives';
import { HeaderActions, HeaderButton } from '../../ui/Icon';
import { useAppearance } from '../../ui/theme';
import { useLayout } from '../../ui/layout';
import { space } from '../../ui/tokens';
import { ActionSheet, PromptModal } from '../reader/dialogs';
import { PerRowSheet } from '../reader/PerRowSheet';
import { useGridColumns } from '../../ui/gridColumns';
import { useLibrary, type LibraryItem } from './useLibrary';
import {
  addWorksToCollection, collectionWorkIds, createCollection, deleteCollection, listCollections, removeWorksFromCollection, renameCollection, type ReaderCollection,
} from '../../lib/reader/readerLibrary';

type Cell = { kind: 'collection'; key: string; collection: ReaderCollection } | { kind: 'work'; key: string; item: LibraryItem };
type Sheet = { title?: string; options: Array<{ label: string; destructive?: boolean; onPress: () => void }> } | null;
type Prompt = { title: string; initial?: string; submitLabel: string; onSubmit: (v: string) => void } | null;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function CollectionsScreen() {
  const layout = useLayout(); const cols = useGridColumns(layout.isTablet ? 200 : 150); const [perRowOpen, setPerRowOpen] = useState(false);
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const library = useLibrary();
  const [tick, setTick] = useState(0); const refresh = () => setTick((t) => t + 1);
  useFocusEffect(useCallback(() => { setTick((t) => t + 1); }, []));
  const [openId, setOpenId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [picking, setPicking] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` is how a change to the database reaches the screen
  const all = useMemo(() => listCollections(), [tick]);
  const here = openId ? all.find((x) => x.id === openId) ?? null : null;
  const byId = useMemo(() => new Map(library.items.map((i) => [i.workId, i])), [library.items]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const workIds = useMemo(() => (openId ? collectionWorkIds(openId) : []), [openId, tick]);

  const cells = useMemo<Cell[]>(() => [
    ...all.filter((x) => x.parentId === openId).map((collection): Cell => ({ kind: 'collection', key: `c-${collection.id}`, collection })),
    ...workIds.flatMap((id): Cell[] => { const item = byId.get(id); return item ? [{ kind: 'work', key: `w-${id}`, item }] : []; }),
  ], [all, openId, workIds, byId]);

  const newCollection = () => setPrompt({ title: here ? `New collection inside “${here.name}”` : 'New collection', submitLabel: 'Create', onSubmit: (name) => { if (name.trim()) { createCollection(name.trim(), openId); refresh(); } } });
  const addMenu = () => setSheet({
    options: [
      ...(openId ? [{ label: 'Add comics from My Collection…', onPress: () => setPicking(true) }] : []),
      { label: here ? 'New collection inside this one…' : 'New collection…', onPress: newCollection },
    ],
  });
  const collectionMenu = (x: ReaderCollection) => setSheet({
    title: x.name,
    options: [
      { label: 'Rename…', onPress: () => setPrompt({ title: 'Rename collection', initial: x.name, submitLabel: 'Save', onSubmit: (name) => { if (name.trim()) { renameCollection(x.id, name.trim()); refresh(); } } }) },
      { label: 'Delete (the comics stay in My Collection)', destructive: true, onPress: () => { deleteCollection(x.id); if (openId === x.id) setOpenId(x.parentId); refresh(); } },
    ],
  });
  const workMenu = (item: LibraryItem) => setSheet({
    title: item.title,
    options: [
      { label: 'Open', onPress: () => router.push(`/comic/${item.workId}`) },
      { label: 'Remove from this collection', destructive: true, onPress: () => { if (openId) { removeWorksFromCollection(openId, [item.workId]); refresh(); } } },
    ],
  });

  const subtitle = (x: ReaderCollection) => [x.count || !x.subcollections ? plural(x.count, 'comic', 'comics') : null, x.subcollections ? plural(x.subcollections, 'collection', 'collections') : null].filter(Boolean).join(' · ');
  const parentName = here?.parentId ? all.find((x) => x.id === here.parentId)?.name : undefined;

  return (
    <AppShell active="library" back title="Collections" right={<HeaderActions><HeaderButton icon="grid-outline" label="Comics per row" onPress={() => setPerRowOpen(true)} /><HeaderButton icon="add" label="Add" onPress={addMenu} /></HeaderActions>}>
      {here ? (
        <View style={styles.crumbs}>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setOpenId(here.parentId)}><Text style={[styles.back, { color: c.primary, fontFamily: typography.bodySemibold }]}>‹ {parentName ?? 'Collections'}</Text></Pressable>
          <Text numberOfLines={1} style={[styles.here, { color: c.textPrimary, fontFamily: typography.display }]}>{here.name}</Text>
        </View>
      ) : null}
      <FlashList
        key={`cols-${cols}`}
        data={cells}
        numColumns={cols}
        keyExtractor={(cell) => cell.key}
        getItemType={(cell) => cell.kind}
        extraData={tick}
        contentContainerStyle={styles.content}
        renderItem={({ item: cell }) => cell.kind === 'collection'
          ? (
            <Pressable accessibilityRole="button" style={styles.cell} onPress={() => setOpenId(cell.collection.id)} onLongPress={() => collectionMenu(cell.collection)}>
              <View style={[styles.folder, { backgroundColor: c.surface, borderColor: c.border }]}><Text style={[styles.glyph, { color: c.primary }]}>❖</Text></View>
              <Text numberOfLines={2} style={[styles.title, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{cell.collection.name}</Text>
              <Text numberOfLines={1} style={[styles.sub, { color: c.textMuted, fontFamily: typography.body }]}>{subtitle(cell.collection)}</Text>
            </Pressable>
          )
          : (
            <View style={styles.cell}>
              <ComicCover size="fluid" title={cell.item.title} workId={cell.item.workId} recyclingKey={`col-${cell.item.workId}`} onPress={() => router.push(`/comic/${cell.item.workId}`)} />
              <Pressable accessibilityRole="button" onLongPress={() => workMenu(cell.item)} delayLongPress={350}>
                <Text numberOfLines={2} style={[styles.title, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{cell.item.title}</Text>
                <Text style={[styles.sub, { color: c.textMuted, fontFamily: typography.body }]}>Hold for options</Text>
              </Pressable>
            </View>
          )}
        ListEmptyComponent={here
          ? <EmptyState title="Nothing in here yet" copy="Add comics from My Collection, or make a collection inside this one." action="Add comics" onAction={() => setPicking(true)} />
          : <EmptyState title="No collections yet" copy="Group your comics your own way, like “Batman”, “Reading next” or “Lent out”." action="New collection" onAction={newCollection} />}
      />
      {picking && openId ? <Picker items={library.items} collectionId={openId} onClose={() => setPicking(false)} onAdded={refresh} /> : null}
      <PerRowSheet visible={perRowOpen} onClose={() => setPerRowOpen(false)} />
      <ActionSheet visible={!!sheet} title={sheet?.title} options={sheet?.options ?? []} onClose={() => setSheet(null)} />
      <PromptModal visible={!!prompt} title={prompt?.title ?? ''} initial={prompt?.initial} submitLabel={prompt?.submitLabel} onSubmit={(v) => prompt?.onSubmit(v)} onClose={() => setPrompt(null)} />
    </AppShell>
  );
}

/** Every comic in My Collection, to tick and add to this collection. Ones already in it are shown as added. */
function Picker({ items, collectionId, onClose, onAdded }: { items: LibraryItem[]; collectionId: string; onClose: () => void; onAdded: () => void }) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const layout = useLayout(); const cols = useGridColumns(layout.isTablet ? 150 : 110);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const already = useMemo(() => new Set(collectionWorkIds(collectionId)), [collectionId]);
  const mine = useMemo(() => items.filter((i) => i.own !== 'none' && i.title.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.title.localeCompare(b.title)), [items, query]);
  const toggle = (id: string) => setChosen((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.picker, { backgroundColor: c.background }]}>
        <View style={styles.pickerBar}>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={onClose}><Text style={[styles.pickerBtn, { color: c.primary, fontFamily: typography.bodySemibold }]}>Cancel</Text></Pressable>
          <Text style={[styles.pickerTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>Add from My Collection</Text>
          <Pressable accessibilityRole="button" disabled={!chosen.size} hitSlop={10} onPress={() => { addWorksToCollection(collectionId, [...chosen]); onAdded(); onClose(); }}>
            <Text style={[styles.pickerBtn, { color: c.primary, fontFamily: typography.bodySemibold, opacity: chosen.size ? 1 : 0.4 }]}>{chosen.size ? `Add ${chosen.size}` : 'Add'}</Text>
          </Pressable>
        </View>
        <View style={styles.search}><Input placeholder="Search your comics" value={query} onChangeText={setQuery} /></View>
        <FlashList
          key={`pick-${cols}`}
          data={mine}
          numColumns={cols}
          keyExtractor={(i) => i.workId}
          extraData={chosen}
          contentContainerStyle={styles.content}
          renderItem={({ item }) => {
            const added = already.has(item.workId); const on = chosen.has(item.workId);
            return (
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on || added, disabled: added }} disabled={added} style={[styles.cell, added && { opacity: 0.45 }]} onPress={() => toggle(item.workId)}>
                <View>
                  <ComicCover size="fluid" title={item.title} workId={item.workId} recyclingKey={`pick-${item.workId}`} />
                  {on || added ? <View style={[styles.tick, { backgroundColor: c.primary }]}><Text style={styles.tickText}>✓</Text></View> : null}
                </View>
                <Text numberOfLines={2} style={[styles.title, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{item.title}</Text>
                {added ? <Text style={[styles.sub, { color: c.textMuted, fontFamily: typography.body }]}>Already in</Text> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={<EmptyState title="No comics found" copy={query ? 'Try another title.' : 'My Collection is empty. Scan a shelf or link comics from Drive first.'} />}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 110 },
  crumbs: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.sm },
  back: { fontSize: 16 }, here: { flex: 1, fontSize: 20 },
  cell: { paddingHorizontal: 7, paddingBottom: 20 },
  folder: { width: '100%', aspectRatio: 2 / 3, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 44 },
  title: { fontSize: 14, lineHeight: 18, marginTop: 10 },
  sub: { fontSize: 12, marginTop: 3 },
  picker: { flex: 1 },
  pickerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.lg },
  pickerTitle: { fontSize: 16 }, pickerBtn: { fontSize: 16 },
  search: { paddingHorizontal: space.lg },
  tick: { position: 'absolute', right: 6, top: 6, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  tickText: { color: '#fff', fontWeight: '700' },
});
