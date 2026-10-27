import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { ActionSheet, PromptModal, type SheetOption } from './dialogs';
import { DragStack, STACK_H, STACK_W } from './DragStack';
import { feedback } from '../../lib/platform/feedback';
import { onMyDevice } from '../../lib/platform/device';
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
  listReaderComics, markComic, moveItems, unpreparedLinkIds, renameCollection, renameFolder, renameReaderComic, setComicFolder, setComicPreset, setFolderPreset, setLock, toggleInCollection,
  type ReaderCollection, type ReaderComic, type ReaderFolder,
} from '../../lib/reader/readerLibrary';
import { keepCopyOnDevice, pickAndImportComics, pickAndImportFolder, pickAndLinkComics, pickAndLinkFolder, prepareLinkedComics, removeComic, removeComics, type ImportProgress, type ImportResult } from '../../lib/reader/importComics';
import { getJob, runJob, subscribeJob, useJob } from '../../lib/reader/importJob';
import { canMoveFolders, pathTo, shutFolders } from '../../lib/reader/folderTree';
import { freeSpaceFor, isCached } from '../../lib/reader/cloudCache';
import { Icon } from '../../ui/Icon';
import { checkPassword, isUnlocked, makeLock, markUnlocked, passwordProblem } from '../../lib/reader/lock';
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
  // Selecting several comics, to move or delete them together or drag them onto a folder.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectedRef = useRef(selected);
  const commitSelected = (next: Set<string>) => { selectedRef.current = next; setSelected(next); };
  const [notice, setNotice] = useState<string | null>(null);
  const flash = (text: string) => { setNotice(text); setTimeout(() => setNotice((n) => (n === text ? null : n)), 2600); };

  const refresh = useCallback(() => { setComics(listReaderComics()); setFolders(listFolders()); setCollections(listCollections()); }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const setView = (v: View_) => { setViewState(v); setMeta(VIEW_KEY, v); };

  // ---- privacy lock -------------------------------------------------------------------------------
  const lockedFolders = useMemo(() => new Set(folders.filter((f) => f.locked).map((f) => f.id)), [folders]);
  const openFolders = new Set(folders.filter((f) => isUnlocked('folder', f.id)).map((f) => f.id)); // read each render: unlocks happen outside React state
  // A folder that was open but has locked again (the app left the foreground) goes back to the top.
  const openFolder = openFolderRaw && pathTo(folders, openFolderRaw).some((id) => lockedFolders.has(id) && !openFolders.has(id)) ? null : openFolderRaw;
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

  // Imports run as the app's one background job: they keep going if you leave this screen, and the bar at the bottom of every screen shows how they are doing.
  const job = useJob();
  const runImport = async (label: string, verb: string, fn: (progress: ImportProgress) => Promise<ImportResult>) => {
    const started = await runJob(label, async (progress) => ({ verb, result: await fn(progress) }));
    if (!started) Alert.alert('Another import is running', 'Wait for it to finish, or press Stop on the bar at the bottom.');
    refresh();
  };
  // Comics show up on the shelf as they are added, not only at the end.
  useEffect(() => subscribeJob(() => { const j = getJob(); if (!j.running || j.done % 5 === 0) refresh(); }), [refresh]);
  // Importing while you are inside a folder puts the files in that folder.
  const importHere = () => runImport('Importing', 'Imported', (p) => pickAndImportComics({ folderId: openFolder ?? undefined, ...p }));

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
    const shut = shutFolders(folders, lockedFolders, new Set(folders.filter((f) => isUnlocked('folder', f.id)).map((f) => f.id)));
    const visible = comics.filter((comic) => !(comic.folderId && shut.has(comic.folderId)));
    if (segment === 'collections' && !openCollection) {
      return collections.filter((col) => col.name.toLowerCase().includes(query.trim().toLowerCase())).map((collection) => ({ kind: 'collection', key: collection.id, collection }));
    }
    let pool = visible;
    if (segment === 'collections' && openCollection) { const ids = new Set(collectionComicIds(openCollection)); pool = visible.filter((comic) => ids.has(comic.id)); }
    else if (searching) pool = visible; // search looks everywhere, folders included
    else pool = visible.filter((comic) => comic.folderId === openFolder);
    const sorted = sortComics(pool.filter((comic) => matchesQuery(comic, query)), sort);
    const folderCells: Cell[] = segment === 'library' && !searching ? folders.filter((f) => f.parentId === openFolder).map((folder) => ({ kind: 'folder', key: `f-${folder.id}`, folder })) : [];
    return [...folderCells, ...sorted.map((comic): Cell => ({ kind: 'comic', key: comic.id, comic }))];
  }, [segment, comics, folders, collections, lockedFolders, query, sort, openFolder, openCollection]);

  const folderLabel = (id: string) => pathTo(folders, id).map((p) => folders.find((f) => f.id === p)?.name ?? '').join(' › ');
  /** A list of every folder (with its path) to move things into. `current` gets the tick. */
  const chooseDestination = (title: string, forbidden: (folderId: string) => boolean, current: string | null | undefined, onPick: (target: string | null) => void) => {
    const choices = folders.filter((f) => !forbidden(f.id)).map((f) => ({ id: f.id, label: folderLabel(f.id) })).sort((x, y) => x.label.localeCompare(y.label, undefined, { sensitivity: 'base' }));
    setSheet({
      title,
      options: [
        { label: 'Library (top level)', checked: current === null, onPress: () => onPick(null) },
        ...choices.map((choice) => ({ label: choice.label, checked: current === choice.id, onPress: () => onPick(choice.id) })),
        { label: 'New folder…', onPress: () => setPrompt({ title: 'New folder', submitLabel: 'Create', onSubmit: (name) => onPick(createFolder(name, null)) }) },
      ],
    });
  };
  const pickFolderFor = (comic: ReaderComic) => chooseDestination('Move to folder', () => false, comic.folderId, (target) => { setComicFolder(comic.id, target); refresh(); });

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
      { label: 'New folder inside…', onPress: () => requireUnlock('folder', f.id, f.name, f.locked, () => setPrompt({ title: `New folder in “${f.name}”`, submitLabel: 'Create', onSubmit: (name) => { createFolder(name, f.id); refresh(); } })) },
      { label: 'Move to folder…', onPress: () => requireUnlock('folder', f.id, f.name, f.locked, () => chooseDestination(`Move “${f.name}”`, (id) => !canMoveFolders(folders, [f.id], id), f.parentId, (target) => { moveItems([], [f.id], target); refresh(); })) },
      { label: 'Reading preset for this folder…', onPress: () => pickPreset(f.presetId, 'Folder preset', (id) => { setFolderPreset(f.id, id); refresh(); }) },
      f.locked ? { label: 'Remove password lock', onPress: () => removeLock('folder', f.id, f.name) } : { label: 'Lock with a password…', onPress: () => chooseLock('folder', f.id, f.name) },
      { label: 'Delete folder (keeps what’s inside)', destructive: true, onPress: () => requireUnlock('folder', f.id, f.name, f.locked, () => { deleteFolder(f.id); refresh(); }) },
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

  const parentName = openFolder ? folders.find((f) => f.id === folders.find((x) => x.id === openFolder)?.parentId)?.name : undefined;
  const backLabel = segment === 'collections' ? 'Collections' : parentName ?? 'Library';
  const goBack = () => { if (segment === 'collections') setOpenCollection(null); else setOpenFolder(folders.find((f) => f.id === openFolder)?.parentId ?? null); };

  const addMenu = () => setSheet({
    options: [
      { label: openFolder ? `Import files into “${insideName ?? 'this folder'}”…` : 'Import files…', onPress: importHere },
      { label: 'Link from Drive or Dropbox (saves space)…', onPress: () => runImport('Linking', 'Linked', (p) => pickAndLinkComics({ folderId: openFolder ?? undefined, ...p })) },
      { label: 'Link a whole folder from Drive or Dropbox…', onPress: () => runImport('Linking folder', 'Linked', (p) => pickAndLinkFolder({ parentId: openFolder ?? undefined, ...p })) },
      ...(unpreparedLinkIds().length ? [{ label: `Load covers for linked comics (${unpreparedLinkIds().length} left)`, onPress: () => runImport('Loading covers', 'Prepared', (p) => prepareLinkedComics(p)) }] : []),
      { label: 'Browse an OPDS server…', onPress: () => router.push('/reader/opds') },
      { label: 'Import a folder…', onPress: () => runImport('Importing folder', 'Imported', (p) => pickAndImportFolder({ parentId: openFolder ?? undefined, ...p })) },
      { label: openFolder ? `New folder inside “${insideName ?? 'this folder'}”…` : 'New folder…', onPress: () => setPrompt({ title: 'New folder', submitLabel: 'Create', onSubmit: (name) => { createFolder(name, openFolder); refresh(); } }) },
      ...(segment === 'library' ? [{ label: 'Select comics…', onPress: () => setSelecting(true) }] : []),
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


  // ---- selecting and dragging ---------------------------------------------------------------------
  const toggleSelect = (comic: ReaderComic) => requireUnlock('comic', comic.id, comic.title, comic.locked, () => {
    const next = new Set(selectedRef.current);
    if (next.has(comic.id)) next.delete(comic.id); else next.add(comic.id);
    commitSelected(next);
  });
  const endSelecting = () => { setSelecting(false); commitSelected(new Set()); };
  const selectAll = () => commitSelected(new Set(cells.flatMap((cell) => (cell.kind === 'comic' && !cell.comic.locked ? [cell.comic.id] : []))));
  const targetName = (id: string | null) => (id ? listFolders().find((f) => f.id === id)?.name ?? 'folder' : 'Library'); // reads the database: it also runs from the drag handlers
  const moveSelected = () => chooseDestination(`Move ${selected.size} ${selected.size === 1 ? 'comic' : 'comics'}`, () => false, undefined, (target) => {
    const n = moveItems([...selectedRef.current], [], target);
    endSelecting(); refresh(); flash(`Moved ${n} to ${targetName(target)}`);
  });
  const deleteSelected = () => {
    const ids = [...selected];
    Alert.alert(`Delete ${ids.length} ${ids.length === 1 ? 'comic' : 'comics'}?`, 'They are removed from this device. Comics linked from Drive stay in Drive.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { removeComics(ids); endSelecting(); refresh(); flash(`Deleted ${ids.length}`); } },
    ]);
  };

  // Dragging: hold a comic and move it; the finger's place is checked against the folder tiles about ten times a second.
  // Resting on a folder for a moment opens it (so you can keep going deeper); letting go on a folder moves the selection into it.
  const listRef = useRef<FlashListRef<Cell>>(null);
  const scrollY = useRef(0);
  const frameRef = useRef<View>(null);
  const frameBox = useRef({ x: 0, y: 0, h: 0 });
  const folderViews = useRef(new Map<string, View>());
  const backView = useRef<View>(null);
  const finger = useRef({ x: 0, y: 0 });
  const hover = useRef<{ target: string | null; timer: ReturnType<typeof setTimeout> | null }>({ target: null, timer: null });
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const probing = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [dragLead, setDragLead] = useState<string | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const dragX = useSharedValue(0); const dragY = useSharedValue(0);
  // The functions below run from a timer and from gestures, so they read the screen's current state from here.
  const latest = useRef({ openFolder, folders, lockedFolders });
  useEffect(() => { latest.current = { openFolder, folders, lockedFolders }; });
  useEffect(() => () => { if (tick.current) clearInterval(tick.current); if (hover.current.timer) clearTimeout(hover.current.timer); }, []);

  type Box = { x: number; y: number; w: number; h: number };
  const boxOf = (view: View | null) => new Promise<Box | null>((resolve) => {
    if (!view) { resolve(null); return; }
    view.measureInWindow((x, y, w, h) => resolve(w || h ? { x, y, w, h } : null));
  });
  const within = (b: Box | null, x: number, y: number) => !!b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  /** What is under the finger: a folder's id, 'up' (the back button), or nothing. */
  const targetAt = async (x: number, y: number): Promise<string | null> => {
    const { openFolder: here, lockedFolders: locked } = latest.current;
    if (here && within(await boxOf(backView.current), x, y)) return 'up';
    const entries = [...folderViews.current.entries()].filter(([id]) => !locked.has(id) || isUnlocked('folder', id));
    const boxes = await Promise.all(entries.map(([, view]) => boxOf(view)));
    const hit = boxes.findIndex((b) => within(b, x, y));
    return hit >= 0 ? entries[hit][0] : null;
  };
  const parentOfOpen = () => latest.current.folders.find((f) => f.id === latest.current.openFolder)?.parentId ?? null;
  const hoverOn = (target: string | null) => {
    if (hover.current.target === target) return;
    if (hover.current.timer) clearTimeout(hover.current.timer);
    hover.current = { target, timer: null };
    setHoverTarget(target);
    if (target) feedback.select(); // over a folder
    if (target) hover.current.timer = setTimeout(() => {
      hover.current = { target: null, timer: null }; setHoverTarget(null);
      setOpenFolder(target === 'up' ? parentOfOpen() : target);
    }, 800);
  };
  const scrollBy = (dy: number) => { scrollY.current = Math.max(0, scrollY.current + dy); listRef.current?.scrollToOffset({ offset: scrollY.current, animated: false }); };
  const probe = async () => {
    if (probing.current) return;
    probing.current = true;
    try {
      const { x, y } = finger.current; const box = frameBox.current;
      if (box.h) { const fromTop = y - box.y; if (fromTop < 90) scrollBy(-18); else if (fromTop > box.h - 90) scrollBy(18); } // near an edge: keep scrolling
      hoverOn(await targetAt(x, y));
    } finally { probing.current = false; }
  };
  const place = (x: number, y: number) => { dragX.set(x - frameBox.current.x - STACK_W / 2); dragY.set(y - frameBox.current.y - STACK_H / 2); };
  const dragApi = useMemo(() => ({
    start: (id: string, x: number, y: number) => {
      if (!selectedRef.current.has(id)) commitSelected(new Set(selectedRef.current).add(id));
      finger.current = { x, y };
      setDragging(true);
      feedback.tap(); // picked up
      setDragLead(id);
      frameRef.current?.measureInWindow((fx, fy, _w, h) => { frameBox.current = { x: fx, y: fy, h }; place(finger.current.x, finger.current.y); });
      tick.current = setInterval(() => { void probe(); }, 110);
    },
    move: (x: number, y: number) => { finger.current = { x, y }; place(x, y); },
    end: async () => {
      if (!tick.current) return; // the hold never turned into a drag
      clearInterval(tick.current);
      tick.current = null;
      if (hover.current.timer) clearTimeout(hover.current.timer);
      const target = await targetAt(finger.current.x, finger.current.y);
      hover.current = { target: null, timer: null }; setHoverTarget(null); setDragging(false);
      if (!target) return;
      const destination = target === 'up' ? parentOfOpen() : target;
      const n = moveItems([...selectedRef.current], [], destination);
      feedback.success();
      endSelecting(); refresh(); flash(`Moved ${n} to ${targetName(destination)}`);
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the handlers read live state through refs; they must stay one stable object for the gestures
  }), []);

  const empty = segment === 'collections' && !openCollection
      ? <EmptyState title="No collections yet" copy="Group comics your own way — long-press a comic and choose “Add to collection”." action="New collection" onAction={() => setPrompt({ title: 'New collection', submitLabel: 'Create', onSubmit: (name) => { createCollection(name); refresh(); } })} />
      : query
        ? <EmptyState title="No matches" copy="Try a title, series or writer." />
        : <EmptyState title={inside ? 'This is empty' : 'No files yet'} copy={inside ? 'Import files straight into this folder, or move comics here from their long-press menu.' : 'Import CBZ, CBR, CB7, ZIP, PDF or comic EPUB files from your phone to read them here.'} action={inside && segment === 'library' ? 'Import here' : inside ? undefined : 'Import comics'} onAction={inside && segment !== 'library' ? undefined : importHere} />;

  // The pile under the finger: the comic you picked up on top, then the others, in the order they sit on the shelf.
  const dragCovers = useMemo(() => {
    const chosen = comics.filter((comic) => selected.has(comic.id) && !comic.locked);
    const lead = chosen.findIndex((comic) => comic.id === dragLead);
    const ordered = lead > 0 ? [chosen[lead], ...chosen.slice(0, lead), ...chosen.slice(lead + 1)] : chosen;
    return ordered.slice(0, 4).map((comic) => ({ uri: comic.coverPath, title: comic.title }));
  }, [comics, selected, dragLead]);

  const folderSub = (f: ReaderFolder) => [f.count > 0 || f.subfolders === 0 ? `${f.count} ${f.count === 1 ? 'title' : 'titles'}` : null, f.subfolders ? `${f.subfolders} ${f.subfolders === 1 ? 'folder' : 'folders'}` : null].filter(Boolean).join(' · ');

  const renderItem = ({ item }: { item: Cell }) => {
    if (item.kind === 'folder') return <Tile styles={styles} view={view} width={cellWidth} highlight={hoverTarget === item.folder.id} registerRef={(v) => { if (v) folderViews.current.set(item.folder.id, v); else folderViews.current.delete(item.folder.id); }} label={item.folder.name} sub={folderSub(item.folder)} covers={item.folder.locked && !isUnlocked('folder', item.folder.id) ? [] : folderCovers.get(item.folder.id) ?? []} glyph={item.folder.locked && !isUnlocked('folder', item.folder.id) ? '🔒' : '▤'} onPress={() => requireUnlock('folder', item.folder.id, item.folder.name, item.folder.locked, () => setOpenFolder(item.folder.id))} onLongPress={() => folderMenu(item.folder)} />;
    if (item.kind === 'collection') return <Tile styles={styles} view={view} width={cellWidth} label={item.collection.name} sub={`${item.collection.count} ${item.collection.count === 1 ? 'title' : 'titles'}`} covers={[]} glyph="❖" onPress={() => setOpenCollection(item.collection.id)} onLongPress={() => collectionMenu(item.collection)} />;
    const comic = item.comic; const masked = coverHidden(comic);
    const cover = (
      <View style={[styles.cover, view === 'list' && styles.coverList]}>
        {masked ? <Text style={styles.glyph}>🔒</Text> : <FileCover uri={comic.coverPath} title={comic.title} style={styles.coverImage} recyclingKey={comic.id} transition={120} />}
        {isFinished(comic) && !masked ? <Text style={styles.badge}>✓</Text> : null}
        {selected.has(comic.id) ? <View style={styles.picked}><Icon name="checkmark-circle" size={34} color="#fff" /></View> : null}
        {comic.sourceUri && !masked ? <View style={styles.cloudBadge}><Icon name={isCached(comic.id) ? 'cloud-done-outline' : 'cloud-outline'} size={14} color="#fff" /></View> : null}
      </View>
    );
    const press = () => (selecting ? toggleSelect(comic) : openComic(comic));
    const longPress = selecting ? undefined : () => comicMenu(comic);
    const draggable = (body: ReactNode) => <DragSource enabled={selecting} id={comic.id} api={dragApi}><View collapsable={false} style={[view === 'grid' ? { width: cellWidth, alignSelf: 'center' } : null, dragging && selected.has(comic.id) ? styles.carried : null]}>{body}</View></DragSource>;
    if (view === 'list') {
      return draggable(
        <PressableScale to={0.985} style={styles.listRow} onPress={press} onLongPress={longPress}>
          {cover}
          <View style={styles.listBody}>
            <Text numberOfLines={2} style={styles.title}>{masked ? 'Locked comic' : comic.title}</Text>
            <Text numberOfLines={1} style={styles.sub}>{masked ? 'Enter the password to open' : [sizeLabel(comic.sizeBytes), `${comic.pageCount} pages`, comic.writer].filter(Boolean).join(' · ')}</Text>
            <Progress value={progressFraction(comic)} />
          </View>
        </PressableScale>,
      );
    }
    return draggable(
      <PressableScale style={[styles.cell, { width: cellWidth }]} onPress={press} onLongPress={longPress}>
        {cover}
        <Text numberOfLines={2} style={styles.title}>{masked ? 'Locked comic' : comic.title}</Text>
        <Text numberOfLines={1} style={styles.sub}>{masked ? 'Locked' : [sizeLabel(comic.sizeBytes), `${comic.pageCount} pages`].filter(Boolean).join(' · ')}</Text>
        {progressFraction(comic) > 0 && !isFinished(comic) ? <Progress value={progressFraction(comic)} /> : null}
      </PressableScale>,
    );
  };

  return (
    <AppShell active="library" back title={mode === 'collections' ? 'Collections' : onMyDevice()} right={<HeaderActions><HeaderButton icon="search" label="Search" active={searchOpen} onPress={() => { setSearchOpen((o) => !o); if (searchOpen) setQuery(''); }} /><HeaderButton icon="add" label="Add" disabled={busy || job.running} onPress={addMenu} /></HeaderActions>}>
      <GestureHandlerRootView style={styles.frame}>
      <View ref={frameRef} collapsable={false} style={styles.frame}>
      <FlashList
        ref={listRef}
        scrollEnabled={!dragging}
        onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        extraData={`${selected.size}-${hoverTarget}-${selecting}`}
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
                {inside ? (
                  <View style={styles.crumbs}>
                    <View ref={backView} collapsable={false} style={[styles.backBox, hoverTarget === 'up' && styles.backHot]}>
                      <Pressable onPress={goBack} hitSlop={8}><Text style={styles.back}>‹ {backLabel}</Text></Pressable>
                    </View>
                    <Text numberOfLines={1} style={styles.here}>{insideName}</Text>
                  </View>
                ) : <Text style={styles.count}>{segment === 'collections' ? `${collections.length} ${collections.length === 1 ? 'collection' : 'collections'}` : `${comics.length} ${comics.length === 1 ? 'comic' : 'comics'}`}</Text>}
                <View style={styles.subActions}>
                  {segment === 'library' ? <Pressable accessibilityRole="button" onPress={() => (selecting ? endSelecting() : setSelecting(true))} hitSlop={8}><Text style={styles.sort}>{selecting ? 'Done' : 'Select'}</Text></Pressable> : null}
                  <Pressable accessibilityRole="button" accessibilityLabel="View and sort" onPress={viewMenu} hitSlop={8}><Text style={styles.sort}>{SORT_LABEL[sort]}  ⌄</Text></Pressable>
                </View>
              </View>
            ) : null}
          </Animated.View>
        }
        ListEmptyComponent={empty}
      />
      {dragging ? <DragStack covers={dragCovers} count={selected.size} x={dragX} y={dragY} /> : null}
      {notice ? <View pointerEvents="none" style={styles.toast}><Text style={styles.toastText}>{notice}</Text></View> : null}
      {selecting ? (
        <View style={styles.bar}>
          <View style={styles.barBody}>
            <Text style={styles.barText}>{selected.size ? `${selected.size} selected` : 'Tap comics to select them'}</Text>
            {selected.size ? <Text style={styles.sub}>Hold one and drag it onto a folder</Text> : null}
          </View>
          <Pressable onPress={selectAll} hitSlop={8}><Text style={styles.barBtn}>All</Text></Pressable>
          <Pressable disabled={!selected.size} onPress={moveSelected} hitSlop={8}><Text style={[styles.barBtn, !selected.size && styles.barOff]}>Move</Text></Pressable>
          <Pressable disabled={!selected.size} onPress={deleteSelected} hitSlop={8}><Text style={[styles.barDanger, !selected.size && styles.barOff]}>Delete</Text></Pressable>
        </View>
      ) : null}
      </View>
      </GestureHandlerRootView>
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

function Tile({ styles, view, width, label, sub, glyph, covers, highlight, registerRef, onPress, onLongPress }: { styles: ReturnType<typeof makeStyles>; view: View_; width: number; label: string; sub: string; glyph: string; covers: string[]; highlight?: boolean; registerRef?: (v: View | null) => void; onPress: () => void; onLongPress: () => void }) {
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
  // The wrapper is what the drag looks for under the finger; the ring shows it will accept the drop.
  const ring = highlight ? <View pointerEvents="none" style={styles.dropRing} /> : null;
  // The folder swells as the pile comes over it, then settles back when it leaves.
  const swell = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(highlight ? 1.08 : 1, { damping: 14, stiffness: 240 }) }] }), [highlight]);
  if (view === 'list') {
    return <View ref={registerRef} collapsable={false}><Animated.View style={swell}><PressableScale to={0.985} style={styles.listRow} onPress={onPress} onLongPress={onLongPress}>{stack}<View style={styles.listBody}><Text numberOfLines={2} style={styles.title}>{label}</Text><Text style={styles.sub}>{sub}</Text></View></PressableScale>{ring}</Animated.View></View>;
  }
  return <View ref={registerRef} collapsable={false} style={{ width, alignSelf: 'center' }}><Animated.View style={swell}><PressableScale style={[styles.cell, { width }]} onPress={onPress} onLongPress={onLongPress}>{stack}<Text numberOfLines={1} style={styles.title}>{label}</Text><Text style={styles.sub}>{sub}</Text></PressableScale>{ring}</Animated.View></View>;
}

/** Lets a comic be held and dragged while selecting. A short hold starts the drag; moving sooner just scrolls. */
type DragApi = { start: (id: string, x: number, y: number) => void; move: (x: number, y: number) => void; end: () => void };
function DragSource({ enabled, id, api, children }: { enabled: boolean; id: string; api: DragApi; children: ReactNode }) {
  const gesture = useMemo(() => Gesture.Pan().enabled(enabled).runOnJS(true).activateAfterLongPress(350)
    .onStart((e) => { api.start(id, e.absoluteX, e.absoluteY); })
    .onUpdate((e) => { api.move(e.absoluteX, e.absoluteY); })
    .onFinalize(() => { void api.end(); }), [enabled, id, api]);
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
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
    frame: { flex: 1 },
    crumbs: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
    backBox: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 2, borderColor: 'transparent' },
    backHot: { borderColor: c.primary },
    here: { color: c.textPrimary, fontFamily: t.displayMedium, fontSize: 16, flexShrink: 1 },
    subActions: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
    carried: { opacity: 0.3, transform: [{ scale: 0.94 }] },
    picked: { ...StyleSheet.absoluteFill, backgroundColor: '#00000066', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: c.primary, borderRadius: 14 },
    dropRing: { ...StyleSheet.absoluteFill, borderRadius: 16, borderWidth: 3, borderColor: c.primary, backgroundColor: '#ffffff14' },
    bar: { position: 'absolute', left: space.lg, right: space.lg, bottom: 24, flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.md, paddingHorizontal: space.lg, borderRadius: 18, backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 12 },
    barBody: { flex: 1, gap: 4 },
    barText: { color: c.textPrimary, fontFamily: t.bodySemibold, fontSize: 14 },
    barBtn: { color: c.primary, fontFamily: t.bodySemibold, fontSize: 15 },
    barDanger: { color: c.destructive, fontFamily: t.bodySemibold, fontSize: 15 },
    barOff: { opacity: 0.35 },
    toast: { position: 'absolute', alignSelf: 'center', bottom: 110, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border },
    toastText: { color: c.textPrimary, fontFamily: t.bodySemibold, fontSize: 14 },
  });
}
