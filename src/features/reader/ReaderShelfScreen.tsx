import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { ActionSheet, PromptModal, type SheetOption } from './dialogs';
import { AppShell } from '../../ui/AppShell';
import { EmptyState, Input, Pill, Progress } from '../../ui/primitives';
import { color, font, radius, space, type } from '../../ui/tokens';
import {
  collectionComicIds, collectionsForComic, createCollection, createFolder, deleteCollection, deleteFolder, listCollections, listFolders,
  listReaderComics, markComic, renameCollection, renameFolder, renameReaderComic, setComicFolder, setComicPreset, setFolderPreset, toggleInCollection,
  type ReaderCollection, type ReaderComic, type ReaderFolder,
} from '../../lib/reader/readerLibrary';
import { pickAndImportComics, pickAndImportFolder, removeComic, type ImportResult } from '../../lib/reader/importComics';
import { listPresets } from '../../lib/reader/readerSettings';
import { isFinished, matchesQuery, progressFraction, readingNow, SORT_LABEL, sortComics, type SortKey } from '../../lib/reader/shelf';

type Segment = 'reading' | 'library' | 'collections';
type Cell =
  | { kind: 'comic'; key: string; comic: ReaderComic }
  | { kind: 'folder'; key: string; folder: ReaderFolder }
  | { kind: 'collection'; key: string; collection: ReaderCollection };

const SORTS: SortKey[] = ['recent', 'title', 'added'];
const MIN_CELL = 112;

type Sheet = { title?: string; options: SheetOption[] } | null;
type Prompt = { title: string; initial?: string; submitLabel?: string; onSubmit: (v: string) => void } | null;

export default function ReaderShelfScreen() {
  const { width } = useWindowDimensions();
  const columns = Math.max(3, Math.floor((width - space.lg * 2) / MIN_CELL)); // tablets get more columns
  const cellWidth = (width - space.lg * 2 - space.md * (columns - 1)) / columns;
  const [comics, setComics] = useState<ReaderComic[]>([]);
  const [folders, setFolders] = useState<ReaderFolder[]>([]);
  const [collections, setCollections] = useState<ReaderCollection[]>([]);
  const [segment, setSegment] = useState<Segment>('library');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [openCollection, setOpenCollection] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);

  const refresh = useCallback(() => { setComics(listReaderComics()); setFolders(listFolders()); setCollections(listCollections()); }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const report = (r: ImportResult) => {
    if (r.failed.length) Alert.alert('Some files could not be imported', r.failed.map((f) => `${f.name}: ${f.reason}`).join('\n\n'));
  };
  const runImport = async (fn: () => Promise<ImportResult>) => {
    setBusy(true);
    try { report(await fn()); } finally { setBusy(false); refresh(); }
  };

  const cells: Cell[] = useMemo(() => {
    const searching = query.trim().length > 0;
    if (segment === 'reading') return sortComics(readingNow(comics.filter((c) => matchesQuery(c, query))), 'recent').map((c) => ({ kind: 'comic', key: c.id, comic: c }));
    if (segment === 'collections' && !openCollection) {
      return collections.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase())).map((c) => ({ kind: 'collection', key: c.id, collection: c }));
    }
    let pool = comics;
    if (segment === 'collections' && openCollection) { const ids = new Set(collectionComicIds(openCollection)); pool = comics.filter((c) => ids.has(c.id)); }
    else if (searching) pool = comics; // search looks everywhere, folders included
    else pool = comics.filter((c) => c.folderId === openFolder);
    const sorted = sortComics(pool.filter((c) => matchesQuery(c, query)), sort);
    const folderCells: Cell[] = segment === 'library' && !openFolder && !searching ? folders.map((f) => ({ kind: 'folder', key: `f-${f.id}`, folder: f })) : [];
    return [...folderCells, ...sorted.map((c): Cell => ({ kind: 'comic', key: c.id, comic: c }))];
  }, [segment, comics, folders, collections, query, sort, openFolder, openCollection]);

  const pickFolderFor = (c: ReaderComic) => setSheet({
    title: 'Move to folder',
    options: [
      { label: 'No folder', checked: !c.folderId, onPress: () => { setComicFolder(c.id, null); refresh(); } },
      ...folders.map((f) => ({ label: f.name, checked: c.folderId === f.id, onPress: () => { setComicFolder(c.id, f.id); refresh(); } })),
      { label: 'New folder…', onPress: () => setPrompt({ title: 'New folder', submitLabel: 'Create', onSubmit: (name) => { setComicFolder(c.id, createFolder(name)); refresh(); } }) },
    ],
  });

  const pickCollectionFor = (c: ReaderComic) => {
    const member = new Set(collectionsForComic(c.id));
    setSheet({
      title: 'Collections',
      options: [
        ...collections.map((col) => ({ label: col.name, checked: member.has(col.id), onPress: () => { toggleInCollection(col.id, c.id); refresh(); } })),
        { label: 'New collection…', onPress: () => setPrompt({ title: 'New collection', submitLabel: 'Create', onSubmit: (name) => { toggleInCollection(createCollection(name), c.id); refresh(); } }) },
      ],
    });
  };

  // "Use default" clears the override so the folder / global default applies.
  const pickPreset = (current: string | null, title: string, apply: (id: string | null) => void) => setSheet({
    title,
    options: [
      { label: 'Use default', checked: !current, onPress: () => apply(null) },
      ...listPresets().map((p) => ({ label: p.name, checked: current === p.id, onPress: () => apply(p.id) })),
    ],
  });

  const comicMenu = (c: ReaderComic) => setSheet({
    title: c.title,
    options: [
      { label: 'Open', onPress: () => router.push(`/reader/${c.id}`) },
      { label: 'Rename', onPress: () => setPrompt({ title: 'Rename comic', initial: c.title, onSubmit: (name) => { renameReaderComic(c.id, name); refresh(); } }) },
      { label: isFinished(c) ? 'Mark as unread' : 'Mark as read', onPress: () => { markComic(c.id, !isFinished(c), c.pageCount); refresh(); } },
      { label: 'Add to collection…', onPress: () => pickCollectionFor(c) },
      { label: 'Move to folder…', onPress: () => pickFolderFor(c) },
      { label: 'Reading preset…', onPress: () => pickPreset(c.presetId, 'Reading preset', (id) => { setComicPreset(c.id, id); refresh(); }) },
      { label: 'Delete from device', destructive: true, onPress: () => Alert.alert('Delete comic?', `"${c.title}" will be removed from this device.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { removeComic(c.id); refresh(); } }]) },
    ],
  });

  const folderMenu = (f: ReaderFolder) => setSheet({
    title: f.name,
    options: [
      { label: 'Rename', onPress: () => setPrompt({ title: 'Rename folder', initial: f.name, onSubmit: (name) => { renameFolder(f.id, name); refresh(); } }) },
      { label: 'Reading preset for this folder…', onPress: () => pickPreset(f.presetId, 'Folder preset', (id) => { setFolderPreset(f.id, id); refresh(); }) },
      { label: 'Delete folder (keeps comics)', destructive: true, onPress: () => { deleteFolder(f.id); refresh(); } },
    ],
  });

  const collectionMenu = (col: ReaderCollection) => setSheet({
    title: col.name,
    options: [
      { label: 'Rename', onPress: () => setPrompt({ title: 'Rename collection', initial: col.name, onSubmit: (name) => { renameCollection(col.id, name); refresh(); } }) },
      { label: 'Delete collection (keeps comics)', destructive: true, onPress: () => { deleteCollection(col.id); refresh(); } },
    ],
  });

  const addMenu = () => setSheet({
    options: [
      { label: 'Import files…', onPress: () => runImport(pickAndImportComics) },
      { label: 'Import a folder…', onPress: () => runImport(pickAndImportFolder) },
      { label: 'New folder…', onPress: () => setPrompt({ title: 'New folder', submitLabel: 'Create', onSubmit: (name) => { createFolder(name); refresh(); } }) },
      { label: 'New collection…', onPress: () => setPrompt({ title: 'New collection', submitLabel: 'Create', onSubmit: (name) => { createCollection(name); refresh(); } }) },
      { label: 'Reader settings', onPress: () => router.push('/reader/settings') },
    ],
  });

  const insideName = segment === 'library' ? folders.find((f) => f.id === openFolder)?.name : segment === 'collections' ? collections.find((c) => c.id === openCollection)?.name : undefined;
  const inside = !!insideName;
  const switchSegment = (s: Segment) => { setSegment(s); setOpenFolder(null); setOpenCollection(null); };

  const empty = segment === 'reading'
    ? <EmptyState title="Nothing in progress" copy="Comics you start reading show up here, most recent first." />
    : segment === 'collections' && !openCollection
      ? <EmptyState title="No collections yet" copy="Group comics your own way — long-press a comic and choose “Add to collection”." action="New collection" onAction={() => setPrompt({ title: 'New collection', submitLabel: 'Create', onSubmit: (name) => { createCollection(name); refresh(); } })} />
      : query
        ? <EmptyState title="No matches" copy="Try a title, series or writer." />
        : <EmptyState title={inside ? 'This is empty' : 'No files yet'} copy={inside ? 'Move comics here from their long-press menu.' : 'Import CBZ, CBR, CB7, ZIP, PDF or comic EPUB files from your phone to read them here.'} action={inside ? undefined : 'Import comics'} onAction={inside ? undefined : () => runImport(pickAndImportComics)} />;

  return (
    <AppShell active="library" title="Read Files" right={<Pressable accessibilityRole="button" accessibilityLabel="Add" onPress={addMenu} disabled={busy}><Text style={styles.add}>{busy ? '…' : '＋'}</Text></Pressable>}>
      <FlatList
        key={columns}
        data={cells}
        numColumns={columns}
        keyExtractor={(c) => c.key}
        contentContainerStyle={styles.content}
        columnWrapperStyle={styles.row}
        ListHeaderComponent={
          <View style={styles.header}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
              <Pill label="Reading now" active={segment === 'reading'} onPress={() => switchSegment('reading')} />
              <Pill label="Library" active={segment === 'library'} onPress={() => switchSegment('library')} />
              <Pill label="Collections" active={segment === 'collections'} onPress={() => switchSegment('collections')} />
            </ScrollView>
            <View style={styles.quick}>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => runImport(pickAndImportComics)} style={[styles.quickBtn, styles.quickPrimary]}><Text style={styles.quickPrimaryText}>{busy ? 'Importing…' : '＋ Import files'}</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => runImport(pickAndImportFolder)} style={styles.quickBtn}><Text style={styles.quickText}>Import folder</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => setPrompt({ title: segment === 'collections' ? 'New collection' : 'New folder', submitLabel: 'Create', onSubmit: (name) => { if (segment === 'collections') createCollection(name); else createFolder(name); refresh(); } })} style={styles.quickBtn}><Text style={styles.quickText}>{segment === 'collections' ? 'New collection' : 'New folder'}</Text></Pressable>
            </View>
            <Input placeholder="Search title, series or writer" value={query} onChangeText={setQuery} />
            {segment !== 'reading' ? (
              <View style={styles.subrow}>
                {inside ? <Pressable onPress={() => { setOpenFolder(null); setOpenCollection(null); }}><Text style={styles.back}>‹ {insideName}</Text></Pressable> : <Text style={styles.count}>{segment === 'collections' ? `${collections.length} ${collections.length === 1 ? 'collection' : 'collections'}` : `${comics.length} ${comics.length === 1 ? 'comic' : 'comics'}`}</Text>}
                {!(segment === 'collections' && !openCollection) ? <Pressable onPress={() => setSort(SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length])}><Text style={styles.sort}>Sort: {SORT_LABEL[sort]}</Text></Pressable> : null}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={empty}
        renderItem={({ item }) => {
          if (item.kind === 'folder') return <Tile width={cellWidth} label={item.folder.name} sub={`${item.folder.count} ${item.folder.count === 1 ? 'comic' : 'comics'}`} glyph="▤" onPress={() => setOpenFolder(item.folder.id)} onLongPress={() => folderMenu(item.folder)} />;
          if (item.kind === 'collection') return <Tile width={cellWidth} label={item.collection.name} sub={`${item.collection.count} ${item.collection.count === 1 ? 'comic' : 'comics'}`} glyph="❖" onPress={() => setOpenCollection(item.collection.id)} onLongPress={() => collectionMenu(item.collection)} />;
          const c = item.comic;
          return (
            <Pressable style={[styles.cell, { width: cellWidth }]} onPress={() => router.push(`/reader/${c.id}`)} onLongPress={() => comicMenu(c)}>
              <View style={styles.cover}>
                {c.coverPath ? <Image source={{ uri: c.coverPath }} style={styles.coverImage} contentFit="cover" recyclingKey={c.id} transition={120} /> : null}
                {isFinished(c) ? <Text style={styles.badge}>✓</Text> : null}
              </View>
              <Text numberOfLines={2} style={styles.title}>{c.title}</Text>
              <Progress value={progressFraction(c)} />
            </Pressable>
          );
        }}
      />
      <ActionSheet visible={!!sheet} title={sheet?.title} options={sheet?.options ?? []} onClose={() => setSheet(null)} />
      <PromptModal visible={!!prompt} title={prompt?.title ?? ''} initial={prompt?.initial} submitLabel={prompt?.submitLabel} onSubmit={(v) => prompt?.onSubmit(v)} onClose={() => setPrompt(null)} />
    </AppShell>
  );
}

function Tile({ width, label, sub, glyph, onPress, onLongPress }: { width: number; label: string; sub: string; glyph: string; onPress: () => void; onLongPress: () => void }) {
  return (
    <Pressable style={[styles.cell, { width }]} onPress={onPress} onLongPress={onLongPress}>
      <View style={[styles.cover, styles.tile]}><Text style={styles.glyph}>{glyph}</Text></View>
      <Text numberOfLines={2} style={styles.title}>{label}</Text>
      <Text style={styles.sub}>{sub}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 105 },
  row: { gap: space.md, marginBottom: space.lg },
  header: { gap: space.md, marginBottom: space.md },
  pills: { gap: 8 },
  quick: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  quickBtn: { minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center' },
  quickPrimary: { backgroundColor: color.accent, borderColor: color.accent },
  quickText: { color: color.text, fontFamily: font.bodyMedium, fontSize: type.caption },
  quickPrimaryText: { color: color.text, fontFamily: font.bodySemibold, fontSize: type.caption },
  subrow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  count: { color: color.muted, fontFamily: font.body, fontSize: type.caption },
  sort: { color: color.accent, fontFamily: font.bodyMedium, fontSize: type.caption },
  back: { color: color.accent, fontFamily: font.bodySemibold, fontSize: type.body },
  add: { color: color.accent, fontSize: 28 },
  cell: { gap: 6 },
  cover: { aspectRatio: 2 / 3, borderRadius: radius.sm, backgroundColor: color.surface2, overflow: 'hidden', borderWidth: 1, borderColor: color.border },
  coverImage: { width: '100%', height: '100%' },
  tile: { alignItems: 'center', justifyContent: 'center' },
  glyph: { color: color.accent, fontSize: 40 },
  badge: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: color.positive, color: color.text, textAlign: 'center', fontSize: 13, lineHeight: 20, overflow: 'hidden' },
  title: { color: color.text, fontFamily: font.displayMedium, fontSize: 12, lineHeight: 15 },
  sub: { color: color.faint, fontFamily: font.bodyMedium, fontSize: 11 },
});
