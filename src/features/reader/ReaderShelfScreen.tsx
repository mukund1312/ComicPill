import { useCallback, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ActionSheet, PromptModal, type SheetOption } from './dialogs';
import { AppShell } from '../../ui/AppShell';
import { HeaderActions, HeaderButton } from '../../ui/Icon';
import { useLayout } from '../../ui/layout';
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
import { keepCopyOnDevice, pickAndImportComics, pickAndImportFolder, pickAndLinkComics, removeComic, type ImportResult } from '../../lib/reader/importComics';
import { freeSpaceFor, isCached } from '../../lib/reader/cloudCache';
import { Icon } from '../../ui/Icon';
import { checkPassword, isHiddenByFolder, isUnlocked, makeLock, markUnlocked, passwordProblem } from '../../lib/reader/lock';
import { newSalt, sha256 } from '../../lib/reader/lockCrypto';
import { listPresets } from '../../lib/reader/readerSettings';
import { isFinished, matchesQuery, progressFraction, readingNow, SORT_LABEL, sortComics, type SortKey } from '../../lib/reader/shelf';

type Segment = 'library' | 'collections';
type View_ = 'grid' | 'list';
type Cell =
  | { kind: 'comic'; key: string; comic: ReaderComic }
  | { kind: 'folder'; key: string; folder: ReaderFolder }
  | { kind: 'collection'; key: string; collection: ReaderCollection };

const SORTS: SortKey[] = ['recent', 'title', 'added'];
const MIN_CELL = 168; const TABLET_CELL = 224;
const VIEW_KEY = 'reader_view';
const sizeLabel = (bytes: number | null) => (bytes == null ? null : bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

type Sheet = { title?: string; options: SheetOption[] } | null;
type Prompt = { title: string; initial?: string; submitLabel?: string; secure?: boolean; onSubmit: (v: string) => void } | null;

export default function ReaderShelfScreen({ mode = 'phone' }: { mode?: 'phone' | 'collections' }) {
  const layout = useLayout(); const width = layout.maxContent;
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const styles = useMemo(() => makeStyles(c, typography), [c, typography]);

  const [view, setViewState] = useState<View_>(() => (getMeta(VIEW_KEY) === 'list' ? 'list' : 'grid'));
  const columns = view === 'list' ? 1 : Math.max(2, Math.floor((width - space.lg * 2) / (layout.isTablet ? TABLET_CELL : MIN_CELL))); // two generous columns on phones, more on tablets
  const cellWidth = (width - space.lg * 2 - space.md * (columns - 1)) / columns;
  const [comics, setComics] = useState<ReaderComic[]>([]);
  const [folders, setFolders] = useState<ReaderFolder[]>([]);
  const [collections, setCollections] = useState<ReaderCollection[]>([]);
  const segment: Segment = mode === 'collections' ? 'collections' : 'library';
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

  // A folder wears the covers of the first comics inside it (oldest first), so it never looks blank.
  const folderCovers = useMemo(() => {
    const byFolder = new Map<string, string[]>();
    // (a comic with no usable cover still counts: its tile falls back to a title card)
    for (const comic of [...comics].sort((a, b) => a.addedAt - b.addedAt)) {
      if (!comic.folderId || comic.locked) continue;
      const list = byFolder.get(comic.folderId) ?? [];
      if (list.length < 3) { list.push(comic.coverPath ?? ''); byFolder.set(comic.folderId, list); }
    }
    return byFolder;
  }, [comics]);

  const cells: Cell[] = useMemo(() => {
    const searching = query.trim().length > 0;
    const visible = comics.filter((comic) => !isHiddenByFolder(comic, lockedFolders, new Set(folders.filter((f) => isUnlocked('folder', f.id)).map((f) => f.id))));
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
      ...(comic.sourceUri ? [{ label: 'Keep a copy on this device', onPress: () => { setBusy(true); void keepCopyOnDevice(comic.id).then(() => Alert.alert('Saved', 'It now reads offline.')).catch(() => Alert.alert('Couldn’t save it', 'Check your connection and try again.')).finally(() => { setBusy(false); refresh(); }); } }] : []),
      ...(comic.sourceUri && isCached(comic.id) ? [{ label: 'Free up space (keeps the link)', onPress: () => { freeSpaceFor(comic.id); refresh(); } }] : []),
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
      ...(Platform.OS === 'android' ? [{ label: 'Link from Drive or Dropbox (saves space)…', onPress: () => runImport(() => pickAndLinkComics({ folderId: openFolder ?? undefined })) }] : []),
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


  const empty = segment === 'collections' && !openCollection
      ? <EmptyState title="No collections yet" copy="Group comics your own way — long-press a comic and choose “Add to collection”." action="New collection" onAction={() => setPrompt({ title: 'New collection', submitLabel: 'Create', onSubmit: (name) => { createCollection(name); refresh(); } })} />
      : query
        ? <EmptyState title="No matches" copy="Try a title, series or writer." />
        : <EmptyState title={inside ? 'This is empty' : 'No files yet'} copy={inside ? 'Import files straight into this folder, or move comics here from their long-press menu.' : 'Import CBZ, CBR, CB7, ZIP, PDF or comic EPUB files from your phone to read them here.'} action={inside && segment === 'library' ? 'Import here' : inside ? undefined : 'Import comics'} onAction={inside && segment !== 'library' ? undefined : importHere} />;

  const renderItem = ({ item }: { item: Cell }) => {
    if (item.kind === 'folder') return <Tile styles={styles} view={view} width={cellWidth} label={item.folder.name} sub={`${item.folder.count} ${item.folder.count === 1 ? 'title' : 'titles'}`} covers={item.folder.locked && !isUnlocked('folder', item.folder.id) ? [] : folderCovers.get(item.folder.id) ?? []} glyph={item.folder.locked && !isUnlocked('folder', item.folder.id) ? '🔒' : '▤'} onPress={() => requireUnlock('folder', item.folder.id, item.folder.name, item.folder.locked, () => setOpenFolder(item.folder.id))} onLongPress={() => folderMenu(item.folder)} />;
    if (item.kind === 'collection') return <Tile styles={styles} view={view} width={cellWidth} label={item.collection.name} sub={`${item.collection.count} ${item.collection.count === 1 ? 'title' : 'titles'}`} covers={[]} glyph="❖" onPress={() => setOpenCollection(item.collection.id)} onLongPress={() => collectionMenu(item.collection)} />;
    const comic = item.comic; const masked = coverHidden(comic);
    const cover = (
      <View style={[styles.cover, view === 'list' && styles.coverList]}>
        {masked ? <Text style={styles.glyph}>🔒</Text> : <FileCover uri={comic.coverPath} title={comic.title} style={styles.coverImage} recyclingKey={comic.id} transition={120} />}
        {isFinished(comic) && !masked ? <Text style={styles.badge}>✓</Text> : null}
        {comic.sourceUri && !masked ? <View style={styles.cloudBadge}><Icon name={isCached(comic.id) ? 'cloud-done-outline' : 'cloud-outline'} size={14} color="#fff" /></View> : null}
      </View>
    );
    if (view === 'list') {
      return (
        <PressableScale to={0.985} style={styles.listRow} onPress={() => openComic(comic)} onLongPress={() => comicMenu(comic)}>
          {cover}
          <View style={styles.listBody}>
            <Text numberOfLines={2} style={styles.title}>{masked ? 'Locked comic' : comic.title}</Text>
            <Text numberOfLines={1} style={styles.sub}>{masked ? 'Enter the password to open' : [sizeLabel(comic.sizeBytes), `${comic.pageCount} pages`, comic.writer].filter(Boolean).join(' · ')}</Text>
            <Progress value={progressFraction(comic)} />
          </View>
        </PressableScale>
      );
    }
    return (
      <PressableScale style={[styles.cell, { width: cellWidth }]} onPress={() => openComic(comic)} onLongPress={() => comicMenu(comic)}>
        {cover}
        <Text numberOfLines={2} style={styles.title}>{masked ? 'Locked comic' : comic.title}</Text>
        <Text numberOfLines={1} style={styles.sub}>{masked ? 'Locked' : [sizeLabel(comic.sizeBytes), `${comic.pageCount} pages`].filter(Boolean).join(' · ')}</Text>
        {progressFraction(comic) > 0 && !isFinished(comic) ? <Progress value={progressFraction(comic)} /> : null}
      </PressableScale>
    );
  };

  return (
    <AppShell active="library" back title={mode === 'collections' ? 'Collections' : 'On My Phone'} right={<HeaderActions><HeaderButton icon="search" label="Search" active={searchOpen} onPress={() => { setSearchOpen((o) => !o); if (searchOpen) setQuery(''); }} /><HeaderButton icon="add" label="Add" disabled={busy} onPress={addMenu} /></HeaderActions>}>
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
            {searchOpen || query ? <Input placeholder="Search title, series or writer" value={query} onChangeText={setQuery} /> : null}
            {true ? (
              <View style={styles.subrow}>
                {inside ? <Pressable onPress={() => { setOpenFolder(null); setOpenCollection(null); }}><Text style={styles.back}>‹ {insideName}</Text></Pressable> : <Text style={styles.count}>{segment === 'collections' ? `${collections.length} ${collections.length === 1 ? 'collection' : 'collections'}` : `${comics.length} ${comics.length === 1 ? 'comic' : 'comics'}`}</Text>}
                <Pressable accessibilityRole="button" accessibilityLabel="View and sort" onPress={viewMenu} hitSlop={8}><Text style={styles.sort}>{SORT_LABEL[sort]}  ⌄</Text></Pressable>
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

/** A cover that never leaves a blank box: if the file's cover is missing or won't decode, show the title on a tinted card. */
function FileCover({ uri, title, style, recyclingKey, transition }: { uri: string | null | undefined; title: string; style: object; recyclingKey: string; transition?: number }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    return <View style={[style, { backgroundColor: '#2A2F3A', alignItems: 'center', justifyContent: 'center', padding: 10 }]}><Text numberOfLines={5} style={{ color: '#E8E8EC', fontSize: 13, fontWeight: '700', textAlign: 'center' }}>{title}</Text></View>;
  }
  return <Image source={{ uri }} style={style} contentFit="cover" recyclingKey={recyclingKey} transition={transition} onError={() => setFailed(true)} />;
}

function Tile({ styles, view, width, label, sub, glyph, covers, onPress, onLongPress }: { styles: ReturnType<typeof makeStyles>; view: View_; width: number; label: string; sub: string; glyph: string; covers: string[]; onPress: () => void; onLongPress: () => void }) {
  // Up to three covers fanned out behind the first, like a stack of issues; an empty folder shows its glyph.
  const stack = (
    <View style={[styles.stack, view === 'list' && styles.stackList]}>
      {covers.length === 0 ? <View style={[styles.cover, styles.tile, styles.stackFill]}><Text style={styles.glyph}>{glyph}</Text></View> : null}
      {covers.slice(1).reverse().map((uri, i) => (
        <View key={`${i}-${uri}`} style={[styles.stackBack, { transform: [{ translateX: (i === 0 && covers.length > 2 ? 1 : -1) * 9 }, { rotate: `${(i === 0 && covers.length > 2 ? 1 : -1) * 7}deg` }, { scale: 0.93 }], opacity: 0.9 }]}>
          <FileCover uri={uri} title="" style={styles.coverImage} recyclingKey={`${uri}-back`} />
        </View>
      ))}
      {covers.length ? <View style={[styles.cover, styles.stackFill]}><FileCover uri={covers[0]} title={label} style={styles.coverImage} recyclingKey={covers[0]} transition={120} /></View> : null}
    </View>
  );
  if (view === 'list') {
    return <PressableScale to={0.985} style={styles.listRow} onPress={onPress} onLongPress={onLongPress}>{stack}<View style={styles.listBody}><Text numberOfLines={2} style={styles.title}>{label}</Text><Text style={styles.sub}>{sub}</Text></View></PressableScale>;
  }
  return <PressableScale style={[styles.cell, { width }]} onPress={onPress} onLongPress={onLongPress}>{stack}<Text numberOfLines={1} style={styles.title}>{label}</Text><Text style={styles.sub}>{sub}</Text></PressableScale>;
}

function makeStyles(c: ThemeColors, t: TypographyPreset) {
  return StyleSheet.create({
    content: { padding: space.lg, paddingBottom: 110 },
    header: { gap: space.md, marginBottom: space.md },
    pills: { gap: 8 },
    subrow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    count: { color: c.textSecondary, fontFamily: t.body, fontSize: 13 },
    sort: { color: c.textSecondary, fontFamily: t.bodySemibold, fontSize: 13 },
    back: { color: c.primary, fontFamily: t.bodySemibold, fontSize: 16 },
    add: { color: c.primary, fontSize: 28 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
    searchIcon: { color: c.primary, fontSize: 26 },
    cell: { gap: 6, marginBottom: space.xl, alignSelf: 'center' },
    stack: { aspectRatio: 2 / 3, width: '100%' },
    stackList: { width: 58, height: 86, aspectRatio: undefined },
    stackFill: { width: '100%', height: '100%' },
    stackBack: { ...StyleSheet.absoluteFill, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: c.border },
    cover: { aspectRatio: 2 / 3, borderRadius: 14, backgroundColor: c.surfaceRaised, overflow: 'hidden', borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
    coverList: { width: 58, aspectRatio: undefined, height: 86 },
    coverImage: { width: '100%', height: '100%' },
    tile: { alignItems: 'center', justifyContent: 'center' },
    glyph: { color: c.primary, fontSize: 36 },
    cloudBadge: { position: 'absolute', left: 6, top: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: '#000000AA', alignItems: 'center', justifyContent: 'center' },
    badge: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: c.success, color: c.primaryForeground, textAlign: 'center', fontSize: 13, lineHeight: 20, overflow: 'hidden' },
    title: { color: c.textPrimary, fontFamily: t.displayMedium, fontSize: 14, lineHeight: 18, marginTop: 4 },
    sub: { color: c.textMuted, fontFamily: t.body, fontSize: 12 },
    listRow: { flexDirection: 'row', gap: space.md, alignItems: 'center', paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    listBody: { flex: 1, gap: 4 },
  });
}
