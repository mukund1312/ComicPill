import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ActionSheet, PromptModal, type SheetOption } from './dialogs';
import { AppShell } from '../../ui/AppShell';
import { PressableScale } from '../../ui/PressableScale';
import { EmptyState, Input, Pill, Progress } from '../../ui/primitives';
import { useAppearance, type TypographyPreset } from '../../ui/theme';
import type { ThemeColors } from '../../ui/theme';
import { space, radius } from '../../ui/tokens';
import { getMeta, setMeta } from '../../lib/db/queries/meta';
import {
  collectionComicIds, collectionsForComic, createCollection, createFolder, deleteCollection, deleteFolder, getLock, listCollections, listFolders,
  listReaderComics, markComic, renameCollection, renameFolder, renameReaderComic, setComicFolder, setComicPreset, setFolderPreset, setLock, toggleInCollection,
  type ReaderCollection, type ReaderComic, type ReaderFolder,
} from '../../lib/reader/readerLibrary';
import { pickAndImportComics, pickAndImportFolder, removeComic, type ImportResult } from '../../lib/reader/importComics';
import { checkPassword, isHiddenByFolder, isUnlocked, makeLock, markUnlocked, passwordProblem } from '../../lib/reader/lock';
import { newSalt, sha256 } from '../../lib/reader/lockCrypto';
import { listPresets } from '../../lib/reader/readerSettings';
import { isFinished, matchesQuery, progressFraction, readingNow, SORT_LABEL, sortComics, type SortKey } from '../../lib/reader/shelf';

type Segment = 'reading' | 'library' | 'collections';
type View_ = 'grid' | 'list';
type Cell =
  | { kind: 'comic'; key: string; comic: ReaderComic }
  | { kind: 'folder'; key: string; folder: ReaderFolder }
  | { kind: 'collection'; key: string; collection: ReaderCollection };

const SORTS: SortKey[] = ['recent', 'title', 'added'];
const MIN_CELL = 112;
const VIEW_KEY = 'reader_view';

type Sheet = { title?: string; options: SheetOption[] } | null;
type Prompt = { title: string; initial?: string; submitLabel?: string; secure?: boolean; onSubmit: (v: string) => void } | null;

export default function ReaderShelfScreen() {
  const { width } = useWindowDimensions();
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const styles = useMemo(() => makeStyles(c, typography), [c, typography]);

  const [view, setViewState] = useState<View_>(() => (getMeta(VIEW_KEY) === 'list' ? 'list' : 'grid'));
  const columns = view === 'list' ? 1 : Math.max(3, Math.floor((width - space.lg * 2) / MIN_CELL)); // tablets get more columns
  const cellWidth = (width - space.lg * 2 - space.md * (columns - 1)) / columns;
  const [comics, setComics] = useState<ReaderComic[]>([]);
  const [folders, setFolders] = useState<ReaderFolder[]>([]);
  const [collections, setCollections] = useState<ReaderCollection[]>([]);
  const [segment, setSegment] = useState<Segment>(() => (readingNow(listReaderComics()).length ? 'reading' : 'library'));
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [openFolderRaw, setOpenFolder] = useState<string | null>(null);
  const [openCollection, setOpenCollection] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);

  const refresh = useCallback(() => { setComics(listReaderComics()); setFolders(listFolders()); setCollections(listCollections()); }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const setView = (v: View_) => { setViewState(v); setMeta(VIEW_KEY, v); };

  // ---- privacy lock -------------------------------------------------------------------------------
  const lockedFolders = useMemo(() => new Set(folders.filter((f) => f.locked).map((f) => f.id)), [folders]);
  const openFolders = new Set(folders.filter((f) => isUnlocked('folder', f.id)).map((f) => f.id)); // read each render: unlocks happen outside React state
  // A folder that was open but has locked again (the app left the foreground) goes back to the top.
  const openFolder = openFolderRaw && lockedFolders.has(openFolderRaw) && !openFolders.has(openFolderRaw) ? null : openFolderRaw;
  const hidden = (comic: ReaderComic) => isHiddenByFolder(comic, lockedFolders, openFolders);
  const coverHidden = (comic: ReaderComic) => comic.locked && !isUnlocked('comic', comic.id);

  const askPassword = (kind: 'comic' | 'folder', id: string, name: string, then: () => void) => setPrompt({
    title: `Password for “${name}”`, secure: true, submitLabel: 'Unlock',
    onSubmit: async (pw) => {
      const lock = getLock(kind, id);
      if (lock && (await checkPassword(pw, lock, sha256))) { markUnlocked(kind, id); refresh(); then(); }
      else Alert.alert('Wrong password', 'Try again.');
    },
  });
  const requireUnlock = (kind: 'comic' | 'folder', id: string, name: string, locked: boolean, then: () => void) => {
    if (!locked || isUnlocked(kind, id)) then(); else askPassword(kind, id, name, then);
  };
  const chooseLock = (kind: 'comic' | 'folder', id: string, name: string) => setPrompt({
    title: `Choose a password for “${name}”`, secure: true, submitLabel: 'Next',
    onSubmit: (pw) => {
      const problem = passwordProblem(pw);
      if (problem) { Alert.alert('Too short', problem); return; }
      setPrompt({ title: 'Type it again to confirm', secure: true, submitLabel: 'Lock', onSubmit: async (again) => {
        if (again !== pw) { Alert.alert('Those don’t match', 'Nothing was locked.'); return; }
        setLock(kind, id, await makeLock(pw, sha256, newSalt())); markUnlocked(kind, id); refresh();
        Alert.alert('Locked', 'It asks for this password whenever the app has been closed or left. This hides it from casual eyes; it doesn’t encrypt the file.');
      } });
    },
  });
  const removeLock = (kind: 'comic' | 'folder', id: string, name: string) => requireUnlock(kind, id, name, true, () => { setLock(kind, id, null); refresh(); });

  const report = (r: ImportResult) => {
    if (r.failed.length) Alert.alert('Some files could not be imported', r.failed.map((f) => `${f.name}: ${f.reason}`).join('\n\n'));
  };
  const runImport = async (fn: () => Promise<ImportResult>) => {
    setBusy(true);
    try { report(await fn()); } finally { setBusy(false); refresh(); }
  };
  // Importing while you are inside a folder puts the files in that folder.
  const importHere = () => runImport(() => pickAndImportComics({ folderId: openFolder ?? undefined }));

  const cells: Cell[] = useMemo(() => {
    const searching = query.trim().length > 0;
    const visible = comics.filter((comic) => !isHiddenByFolder(comic, lockedFolders, new Set(folders.filter((f) => isUnlocked('folder', f.id)).map((f) => f.id))));
    if (segment === 'reading') return sortComics(readingNow(visible.filter((comic) => matchesQuery(comic, query))), 'recent').map((comic) => ({ kind: 'comic', key: comic.id, comic }));
    if (segment === 'collections' && !openCollection) {
      return collections.filter((col) => col.name.toLowerCase().includes(query.trim().toLowerCase())).map((collection) => ({ kind: 'collection', key: collection.id, collection }));
    }
    let pool = visible;
    if (segment === 'collections' && openCollection) { const ids = new Set(collectionComicIds(openCollection)); pool = visible.filter((comic) => ids.has(comic.id)); }
    else if (searching) pool = visible; // search looks everywhere, folders included
    else pool = visible.filter((comic) => comic.folderId === openFolder);
    const sorted = sortComics(pool.filter((comic) => matchesQuery(comic, query)), sort);
    const folderCells: Cell[] = segment === 'library' && !openFolder && !searching ? folders.map((folder) => ({ kind: 'folder', key: `f-${folder.id}`, folder })) : [];
    return [...folderCells, ...sorted.map((comic): Cell => ({ kind: 'comic', key: comic.id, comic }))];
  }, [segment, comics, folders, collections, lockedFolders, query, sort, openFolder, openCollection]);

  const pickFolderFor = (comic: ReaderComic) => setSheet({
    title: 'Move to folder',
    options: [
      { label: 'No folder', checked: !comic.folderId, onPress: () => { setComicFolder(comic.id, null); refresh(); } },
      ...folders.map((f) => ({ label: f.name, checked: comic.folderId === f.id, onPress: () => { setComicFolder(comic.id, f.id); refresh(); } })),
      { label: 'New folder…', onPress: () => setPrompt({ title: 'New folder', submitLabel: 'Create', onSubmit: (name) => { setComicFolder(comic.id, createFolder(name)); refresh(); } }) },
    ],
  });

  const pickCollectionFor = (comic: ReaderComic) => {
    const member = new Set(collectionsForComic(comic.id));
    setSheet({
      title: 'Collections',
      options: [
        ...collections.map((col) => ({ label: col.name, checked: member.has(col.id), onPress: () => { toggleInCollection(col.id, comic.id); refresh(); } })),
        { label: 'New collection…', onPress: () => setPrompt({ title: 'New collection', submitLabel: 'Create', onSubmit: (name) => { toggleInCollection(createCollection(name), comic.id); refresh(); } }) },
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

  const openComic = (comic: ReaderComic) => requireUnlock('comic', comic.id, comic.title, comic.locked, () => router.push(`/reader/${comic.id}`));

  const comicMenu = (comic: ReaderComic) => setSheet({
    title: coverHidden(comic) ? 'Locked comic' : comic.title,
    options: [
      { label: 'Open', onPress: () => openComic(comic) },
      { label: 'Rename', onPress: () => requireUnlock('comic', comic.id, comic.title, comic.locked, () => setPrompt({ title: 'Rename comic', initial: comic.title, onSubmit: (name) => { renameReaderComic(comic.id, name); refresh(); } })) },
      { label: isFinished(comic) ? 'Mark as unread' : 'Mark as read', onPress: () => { markComic(comic.id, !isFinished(comic), comic.pageCount); refresh(); } },
      { label: 'Add to collection…', onPress: () => pickCollectionFor(comic) },
      { label: 'Move to folder…', onPress: () => pickFolderFor(comic) },
      { label: 'Reading preset…', onPress: () => pickPreset(comic.presetId, 'Reading preset', (id) => { setComicPreset(comic.id, id); refresh(); }) },
      comic.locked ? { label: 'Remove password lock', onPress: () => removeLock('comic', comic.id, comic.title) } : { label: 'Lock with a password…', onPress: () => chooseLock('comic', comic.id, comic.title) },
      { label: 'Delete from device', destructive: true, onPress: () => requireUnlock('comic', comic.id, comic.title, comic.locked, () => Alert.alert('Delete comic?', `"${comic.title}" will be removed from this device.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { removeComic(comic.id); refresh(); } }])) },
    ],
  });

  const folderMenu = (f: ReaderFolder) => setSheet({
    title: f.name,
    options: [
      { label: 'Rename', onPress: () => requireUnlock('folder', f.id, f.name, f.locked, () => setPrompt({ title: 'Rename folder', initial: f.name, onSubmit: (name) => { renameFolder(f.id, name); refresh(); } })) },
      { label: 'Reading preset for this folder…', onPress: () => pickPreset(f.presetId, 'Folder preset', (id) => { setFolderPreset(f.id, id); refresh(); }) },
      f.locked ? { label: 'Remove password lock', onPress: () => removeLock('folder', f.id, f.name) } : { label: 'Lock with a password…', onPress: () => chooseLock('folder', f.id, f.name) },
      { label: 'Delete folder (keeps comics)', destructive: true, onPress: () => requireUnlock('folder', f.id, f.name, f.locked, () => { deleteFolder(f.id); refresh(); }) },
    ],
  });

  const collectionMenu = (col: ReaderCollection) => setSheet({
    title: col.name,
    options: [
      { label: 'Rename', onPress: () => setPrompt({ title: 'Rename collection', initial: col.name, onSubmit: (name) => { renameCollection(col.id, name); refresh(); } }) },
      { label: 'Delete collection (keeps comics)', destructive: true, onPress: () => { deleteCollection(col.id); refresh(); } },
    ],
  });

  const insideName = segment === 'library' ? folders.find((f) => f.id === openFolder)?.name : segment === 'collections' ? collections.find((col) => col.id === openCollection)?.name : undefined;
  const inside = !!insideName;

  const addMenu = () => setSheet({
    options: [
      { label: openFolder ? `Import files into “${insideName ?? 'this folder'}”…` : 'Import files…', onPress: importHere },
      { label: 'Browse an OPDS server…', onPress: () => router.push('/reader/opds') },
      { label: 'Import a folder…', onPress: () => runImport(pickAndImportFolder) },
      { label: 'New folder…', onPress: () => setPrompt({ title: 'New folder', submitLabel: 'Create', onSubmit: (name) => { createFolder(name); refresh(); } }) },
      { label: 'New collection…', onPress: () => setPrompt({ title: 'New collection', submitLabel: 'Create', onSubmit: (name) => { createCollection(name); refresh(); } }) },
      { label: view === 'grid' ? 'Show as a list' : 'Show as a grid', onPress: () => setView(view === 'grid' ? 'list' : 'grid') },
      { label: 'Reader settings', onPress: () => router.push('/reader/settings') },
    ],
  });

  const viewMenu = () => setSheet({
    title: 'View',
    options: [
      { label: 'Grid', checked: view === 'grid', onPress: () => setView('grid') },
      { label: 'List', checked: view === 'list', onPress: () => setView('list') },
      ...SORTS.map((k) => ({ label: `Sort: ${SORT_LABEL[k]}`, checked: sort === k, onPress: () => setSort(k) })),
    ],
  });

  const switchSegment = (s: Segment) => { setSegment(s); setOpenFolder(null); setOpenCollection(null); };

  const empty = segment === 'reading'
    ? <EmptyState title="Nothing in progress" copy="Comics you start reading show up here, most recent first." />
    : segment === 'collections' && !openCollection
      ? <EmptyState title="No collections yet" copy="Group comics your own way — long-press a comic and choose “Add to collection”." action="New collection" onAction={() => setPrompt({ title: 'New collection', submitLabel: 'Create', onSubmit: (name) => { createCollection(name); refresh(); } })} />
      : query
        ? <EmptyState title="No matches" copy="Try a title, series or writer." />
        : <EmptyState title={inside ? 'This is empty' : 'No files yet'} copy={inside ? 'Import files straight into this folder, or move comics here from their long-press menu.' : 'Import CBZ, CBR, CB7, ZIP, PDF or comic EPUB files from your phone to read them here.'} action={inside && segment === 'library' ? 'Import here' : inside ? undefined : 'Import comics'} onAction={inside && segment !== 'library' ? undefined : importHere} />;

  const renderItem = ({ item }: { item: Cell }) => {
    if (item.kind === 'folder') return <Tile styles={styles} view={view} width={cellWidth} label={item.folder.name} sub={`${item.folder.count} ${item.folder.count === 1 ? 'comic' : 'comics'}`} glyph={item.folder.locked && !isUnlocked('folder', item.folder.id) ? '🔒' : '▤'} onPress={() => requireUnlock('folder', item.folder.id, item.folder.name, item.folder.locked, () => setOpenFolder(item.folder.id))} onLongPress={() => folderMenu(item.folder)} />;
    if (item.kind === 'collection') return <Tile styles={styles} view={view} width={cellWidth} label={item.collection.name} sub={`${item.collection.count} ${item.collection.count === 1 ? 'comic' : 'comics'}`} glyph="❖" onPress={() => setOpenCollection(item.collection.id)} onLongPress={() => collectionMenu(item.collection)} />;
    const comic = item.comic; const masked = coverHidden(comic);
    const cover = (
      <View style={[styles.cover, view === 'list' && styles.coverList]}>
        {masked ? <Text style={styles.glyph}>🔒</Text> : comic.coverPath ? <Image source={{ uri: comic.coverPath }} style={styles.coverImage} contentFit="cover" recyclingKey={comic.id} transition={120} /> : null}
        {isFinished(comic) && !masked ? <Text style={styles.badge}>✓</Text> : null}
      </View>
    );
    if (view === 'list') {
      return (
        <PressableScale to={0.985} style={styles.listRow} onPress={() => openComic(comic)} onLongPress={() => comicMenu(comic)}>
          {cover}
          <View style={styles.listBody}>
            <Text numberOfLines={2} style={styles.title}>{masked ? 'Locked comic' : comic.title}</Text>
            <Text numberOfLines={1} style={styles.sub}>{masked ? 'Enter the password to open' : `${comic.format.toUpperCase()} · ${comic.pageCount} pages${comic.writer ? ` · ${comic.writer}` : ''}`}</Text>
            <Progress value={progressFraction(comic)} />
          </View>
        </PressableScale>
      );
    }
    return (
      <PressableScale style={[styles.cell, { width: cellWidth }]} onPress={() => openComic(comic)} onLongPress={() => comicMenu(comic)}>
        {cover}
        <Text numberOfLines={2} style={styles.title}>{masked ? 'Locked comic' : comic.title}</Text>
        <Progress value={progressFraction(comic)} />
      </PressableScale>
    );
  };

  return (
    <AppShell active="read" title="Read now" right={<View style={styles.headerActions}><Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={() => { setSearchOpen((o) => !o); if (searchOpen) setQuery(''); }} hitSlop={8}><Text style={styles.searchIcon}>⌕</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Add" onPress={addMenu} disabled={busy} hitSlop={8}><Text style={styles.add}>{busy ? '…' : '＋'}</Text></Pressable></View>}>
      <FlashList
        key={`${view}-${columns}`}
        data={cells}
        numColumns={columns}
        keyExtractor={(cell) => cell.key}
        getItemType={(cell) => cell.kind}
        contentContainerStyle={styles.content}
        renderItem={renderItem}
        ListHeaderComponent={
          <Animated.View entering={FadeIn.duration(220)} style={styles.header}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
              <Pill label="Reading now" active={segment === 'reading'} onPress={() => switchSegment('reading')} />
              <Pill label="Library" active={segment === 'library'} onPress={() => switchSegment('library')} />
              <Pill label="Collections" active={segment === 'collections'} onPress={() => switchSegment('collections')} />
            </ScrollView>
            {searchOpen || query ? <Input placeholder="Search title, series or writer" value={query} onChangeText={setQuery} /> : null}
            {segment !== 'reading' ? (
              <View style={styles.subrow}>
                {inside ? <Pressable onPress={() => { setOpenFolder(null); setOpenCollection(null); }}><Text style={styles.back}>‹ {insideName}</Text></Pressable> : <Text style={styles.count}>{segment === 'collections' ? `${collections.length} ${collections.length === 1 ? 'collection' : 'collections'}` : `${comics.length} ${comics.length === 1 ? 'comic' : 'comics'}`}</Text>}
                <Pressable accessibilityRole="button" accessibilityLabel="View and sort" onPress={viewMenu} hitSlop={8}><Text style={styles.sort}>{view === 'grid' ? '▦' : '☰'}  {SORT_LABEL[sort]} ▾</Text></Pressable>
              </View>
            ) : null}
          </Animated.View>
        }
        ListEmptyComponent={empty}
      />
      <ActionSheet visible={!!sheet} title={sheet?.title} options={sheet?.options ?? []} onClose={() => setSheet(null)} />
      <PromptModal visible={!!prompt} title={prompt?.title ?? ''} initial={prompt?.initial} submitLabel={prompt?.submitLabel} secure={prompt?.secure} onSubmit={(v) => prompt?.onSubmit(v)} onClose={() => setPrompt(null)} />
    </AppShell>
  );
}

function Tile({ styles, view, width, label, sub, glyph, onPress, onLongPress }: { styles: ReturnType<typeof makeStyles>; view: View_; width: number; label: string; sub: string; glyph: string; onPress: () => void; onLongPress: () => void }) {
  const box = <View style={[styles.cover, styles.tile, view === 'list' && styles.coverList]}><Text style={styles.glyph}>{glyph}</Text></View>;
  if (view === 'list') {
    return <PressableScale to={0.985} style={styles.listRow} onPress={onPress} onLongPress={onLongPress}>{box}<View style={styles.listBody}><Text numberOfLines={2} style={styles.title}>{label}</Text><Text style={styles.sub}>{sub}</Text></View></PressableScale>;
  }
  return <PressableScale style={[styles.cell, { width }]} onPress={onPress} onLongPress={onLongPress}>{box}<Text numberOfLines={2} style={styles.title}>{label}</Text><Text style={styles.sub}>{sub}</Text></PressableScale>;
}

function makeStyles(c: ThemeColors, t: TypographyPreset) {
  return StyleSheet.create({
    content: { padding: space.lg, paddingBottom: 105 },
    header: { gap: space.md, marginBottom: space.md },
    pills: { gap: 8 },
    subrow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    count: { color: c.textSecondary, fontFamily: t.body, fontSize: 13 },
    sort: { color: c.primary, fontFamily: t.bodyMedium, fontSize: 13 },
    back: { color: c.primary, fontFamily: t.bodySemibold, fontSize: 16 },
    add: { color: c.primary, fontSize: 28 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
    searchIcon: { color: c.primary, fontSize: 26 },
    cell: { gap: 6, marginBottom: space.lg, alignSelf: 'center' },
    cover: { aspectRatio: 2 / 3, borderRadius: radius.sm, backgroundColor: c.surfaceRaised, overflow: 'hidden', borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    coverList: { width: 58, aspectRatio: undefined, height: 86 },
    coverImage: { width: '100%', height: '100%' },
    tile: { alignItems: 'center', justifyContent: 'center' },
    glyph: { color: c.primary, fontSize: 36 },
    badge: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: c.success, color: c.primaryForeground, textAlign: 'center', fontSize: 13, lineHeight: 20, overflow: 'hidden' },
    title: { color: c.textPrimary, fontFamily: t.displayMedium, fontSize: 12, lineHeight: 15 },
    sub: { color: c.textMuted, fontFamily: t.bodyMedium, fontSize: 11 },
    listRow: { flexDirection: 'row', gap: space.md, alignItems: 'center', paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    listBody: { flex: 1, gap: 4 },
  });
}
