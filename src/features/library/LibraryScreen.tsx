import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router, useFocusEffect } from 'expo-router';
import { useLibrary, type LibraryItem } from './useLibrary';
import { AppShell } from '../../ui/AppShell';
import { ComicCover } from '../../ui/comic';
import { EmptyState, Input, Pill, Sheet } from '../../ui/primitives';
import { HeaderActions, HeaderButton } from '../../ui/Icon';
import { useAppearance } from '../../ui/theme';
import { useLayout } from '../../ui/layout';
import { ActionSheet } from '../reader/dialogs';
import { color, font, radius, space, type } from '../../ui/tokens';
import { isAccessible, isFormatOwned } from '../../lib/util/own';
import { useTravelMode } from '../../lib/state/travelMode';
import { linkWithCovers, pickAndLinkComics, pickAndLinkFolder } from '../../lib/reader/importComics';
import { runJob, subscribeJob, getJob } from '../../lib/reader/importJob';
import { PerRowSheet } from '../reader/PerRowSheet';
import { useGridColumns } from '../../ui/gridColumns';
import { Icon } from '../../ui/Icon';
import { getMeta, setMeta } from '../../lib/db/queries/meta';
import { downloadedWorkIds, putAway, removeFromCollection } from '../../lib/library/collectionActions';
import { keepLimit } from '../../lib/reader/cloudBudget';
import { sqlite } from '../../lib/db/client';
import { EMPTY_COMIC_FILTERS, hasActiveFilters, matchesFilters, type ComicFilters, type PublisherFilter } from '../../lib/util/comicFilters';

type Filter = 'all' | 'owned' | 'downloaded' | 'reading' | 'read' | 'wishlist';
const filters: Array<[Filter, string]> = [['all', 'All'], ['owned', 'Owned'], ['downloaded', 'Downloaded'], ['reading', 'Reading'], ['read', 'Read'], ['wishlist', 'Wishlist']];

type Sort = 'title' | 'title-desc' | 'rating' | 'downloaded' | 'reading';
const SORTS: Array<[Sort, string]> = [['title', 'Title A–Z'], ['title-desc', 'Title Z–A'], ['rating', 'Highest rated'], ['downloaded', 'Downloaded first'], ['reading', 'Reading first']];
const isSort = (v: string | null): v is Sort => SORTS.some(([k]) => k === v);
const PUBLISHERS: PublisherFilter[] = ['Marvel', 'DC', 'Indie', 'Manga'];

export default function LibraryScreen() {
  const layout = useLayout(); const cols = useGridColumns(layout.isTablet ? 220 : 170); const [perRowOpen, setPerRowOpen] = useState(false);
  const library = useLibrary(); const [filter, setFilter] = useState<Filter>('all'); const [query, setQuery] = useState(''); const [filtersOpen, setFiltersOpen] = useState(false); const [moreOpen, setMoreOpen] = useState(false); const c0 = useAppearance().theme.colors;
  const [comicFilters, setComicFilters] = useState<ComicFilters>(EMPTY_COMIC_FILTERS);
  // Which comics are on this device right now (Drive and server comics are only listed until opened), and how to arrange and pick them.
  const [tick, setTick] = useState(0);
  useFocusEffect(useCallback(() => { setTick((t) => t + 1); }, []));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` is how a change on disk reaches the screen
  const downloaded = useMemo(() => downloadedWorkIds(), [tick, library.items]);
  const [sort, setSortState] = useState<Sort>(() => { const v = getMeta('library_sort'); return isSort(v) ? v : 'title'; });
  const setSort = (k: Sort) => { setSortState(k); setMeta('library_sort', k); };
  const [sortOpen, setSortOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const flash = (text: string) => { setNotice(text); setTimeout(() => setNotice((n) => (n === text ? null : n)), 2600); };
  const endSelecting = () => { setSelecting(false); setPicked(new Set()); };
  const toggle = (workId: string) => setPicked((prev) => { const next = new Set(prev); if (next.has(workId)) next.delete(workId); else next.add(workId); return next; });
  const hasServerComics = useMemo(() => !!sqlite.getFirstSync('SELECT 1 FROM reader_comics WHERE source_uri IS NOT NULL LIMIT 1'), [tick, library.items]); // eslint-disable-line react-hooks/exhaustive-deps
  // Linking runs as the app's one background job (the bar at the bottom shows it); comics appear here as they are added.
  const refreshLibrary = library.refresh;
  useEffect(() => subscribeJob(() => { const j = getJob(); if (!j.running || j.done % 5 === 0) refreshLibrary(); }), [refreshLibrary]);
  const link = async (label: string, work: (p: Parameters<typeof pickAndLinkFolder>[0] & object) => Promise<Awaited<ReturnType<typeof pickAndLinkFolder>>>) => {
    const started = await runJob(label, async (progress) => ({ verb: 'Added', result: await work(progress) }));
    if (!started) Alert.alert('Another import is running', 'Wait for it to finish, or press Stop on the bar at the bottom.');
    refreshLibrary();
  };
  const [addOpen, setAddOpen] = useState(false);
  const digitalOnly = useTravelMode((s) => s.digitalOnly);
  // Library is your collection, not the catalog — only books you've actually
  // added (own !== 'none') show up here at all. The full catalog, owned or
  // not, lives in Discover. A fresh install starts with an empty library;
  // books move in only via "Add to library" on a comic's detail page (or,
  // later, the Scan pipeline) — never automatically.
  const inLibrary = useMemo(() => library.items.filter((item) => item.own !== 'none'), [library.items]);
  const items = useMemo(() => inLibrary.filter((item) => (
    filter === 'all'
    || (filter === 'owned' && isAccessible(item.own))
    || (filter === 'downloaded' && downloaded.has(item.workId))
    || (filter === 'reading' && item.status === 'reading')
    || (filter === 'read' && item.status === 'done')
    // Ordered books are paid for but not yet available to read, so they stay
    // with the buy queue rather than the owned/reading collection.
    || (filter === 'wishlist' && (item.own === 'wishlist' || item.own === 'ordered'))
  )
    // Travel mode: only what's actually reachable without a physical shelf.
    && (!digitalOnly || isFormatOwned(item.own, 'digital'))
    && matchesFilters(item, comicFilters)
    && item.title.toLowerCase().includes(query.toLowerCase())).sort((a, b) => {
    const byTitle = a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
    if (sort === 'title-desc') return -byTitle;
    if (sort === 'rating') return (b.rating ?? -1) - (a.rating ?? -1) || byTitle;
    if (sort === 'downloaded') return Number(downloaded.has(b.workId)) - Number(downloaded.has(a.workId)) || byTitle;
    if (sort === 'reading') return Number(b.status === 'reading') - Number(a.status === 'reading') || byTitle;
    return byTitle;
  }), [inLibrary, filter, query, digitalOnly, comicFilters, sort, downloaded]);
  const ownedCount = useMemo(() => inLibrary.filter((item) => isAccessible(item.own)).length, [inLibrary]);
  const filtersActive = hasActiveFilters(comicFilters);
  return <AppShell active="library" back title="My Collection" right={<HeaderActions><HeaderButton icon="search" label="Search" active={!!query} onPress={() => setQuery(query ? '' : 'a')} /><HeaderButton icon="grid-outline" label="Comics per row" onPress={() => setPerRowOpen(true)} /><HeaderButton icon="add" label="Add comics" onPress={() => setAddOpen(true)} /><HeaderButton icon="scan-outline" label="Scan Shelf" onPress={() => router.push('/scan')} /><HeaderButton icon="options-outline" label="Filter" active={filtersActive} onPress={() => setFiltersOpen(true)} /><HeaderButton icon="ellipsis-horizontal" label="More" onPress={() => setMoreOpen(true)} /></HeaderActions>}>
    <FlashList key={`grid-${cols}`} data={items} numColumns={cols} keyExtractor={(item) => item.workId} getItemType={() => 'cover-grid'} extraData={`${selecting}-${picked.size}-${downloaded.size}`} renderItem={({ item }) => <LibraryCell item={item} selecting={selecting} picked={picked.has(item.workId)} downloaded={downloaded.has(item.workId)} onToggle={toggle} />} contentContainerStyle={[styles.content, selecting && { paddingBottom: 190 }]} showsVerticalScrollIndicator={false} ListHeaderComponent={<><View style={styles.header}>{query ? <Input placeholder="Search titles, creators, characters" value={query} onChangeText={setQuery} /> : null}<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>{filters.map(([id, label]) => <Pill key={id} label={label} active={filter === id} onPress={() => setFilter(id)} />)}</ScrollView><View style={styles.subrow}><Text style={[styles.count, { color: c0.textMuted }]}>{ownedCount} {ownedCount === 1 ? 'comic' : 'comics'}{hasServerComics ? ` · ${downloaded.size} of ${keepLimit()} downloaded` : ''}</Text><View style={styles.subActions}><Pressable accessibilityRole="button" hitSlop={8} onPress={() => (selecting ? endSelecting() : setSelecting(true))}><Text style={[styles.subLink, { color: c0.textSecondary }]}>{selecting ? 'Done' : 'Select'}</Text></Pressable><Pressable accessibilityRole="button" hitSlop={8} onPress={() => setSortOpen(true)}><Text style={[styles.subLink, { color: c0.textSecondary }]}>{SORTS.find(([k]) => k === sort)?.[1]}  ⌄</Text></Pressable></View></View></View></>} ListEmptyComponent={<EmptyState title="Nothing here yet" copy={query ? 'Try a title, creator, or character.' : 'Your collection is ready for its first great comic.'} action={!query ? 'Browse catalog' : undefined} onAction={!query ? () => router.push('/discover') : undefined} />}/>
    <ActionSheet visible={sortOpen} title="Sort" onClose={() => setSortOpen(false)} options={SORTS.map(([k, label]) => ({ label, checked: sort === k, onPress: () => setSort(k) }))} />
    {notice ? <View pointerEvents="none" style={styles.toast}><Text style={styles.toastText}>{notice}</Text></View> : null}
    {selecting ? (
      <View style={[styles.bar, { backgroundColor: c0.surface, borderColor: c0.border }]}>
        <Text style={[styles.barText, { color: c0.textPrimary }]}>{picked.size ? `${picked.size} selected` : 'Tap comics to select them'}</Text>
        <Pressable hitSlop={8} onPress={() => setPicked(new Set(items.map((i) => i.workId)))}><Text style={[styles.barBtn, { color: c0.primary }]}>All</Text></Pressable>
        <Pressable hitSlop={8} disabled={![...picked].some((id) => downloaded.has(id))} onPress={() => { const n = putAway([...picked]); setTick((t) => t + 1); endSelecting(); flash(n ? `Put away ${n}. They stay in My Collection.` : 'Nothing was downloaded'); }}><Text style={[styles.barBtn, { color: c0.primary }, ![...picked].some((id) => downloaded.has(id)) && styles.barOff]}>Put away</Text></Pressable>
        <Pressable hitSlop={8} disabled={!picked.size} onPress={() => { const ids = [...picked]; Alert.alert(`Remove ${ids.length} ${ids.length === 1 ? 'comic' : 'comics'} from My Collection?`, 'Files you added to this device are deleted. Comics linked from Drive or your comic server stay there, and can be added again.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => { removeFromCollection(ids); library.refresh(); setTick((t) => t + 1); endSelecting(); flash(`Removed ${ids.length}`); } }]); }}><Text style={[styles.barBtn, { color: '#E5484D' }, !picked.size && styles.barOff]}>Remove</Text></Pressable>
      </View>
    ) : null}
    <PerRowSheet visible={perRowOpen} onClose={() => setPerRowOpen(false)} />
    <ActionSheet visible={addOpen} title="Add to My Collection" onClose={() => setAddOpen(false)} options={[
      { label: 'Add a whole folder (Drive, iCloud, Files)…', onPress: () => { void link('Adding folder', (p) => linkWithCovers(() => pickAndLinkFolder(p), p)); } },
      { label: 'Add individual comic files…', onPress: () => { void link('Adding comics', (p) => linkWithCovers(() => pickAndLinkComics(p), p)); } },
      { label: 'Scan a shelf of physical comics', onPress: () => router.push('/scan') },
    ]} />
    <ActionSheet visible={moreOpen} title="Library" onClose={() => setMoreOpen(false)} options={[{ label: 'Playlists', onPress: () => router.push('/playlists') }, { label: 'Compare comics', onPress: () => router.push('/compare') }, { label: 'Mind Space', onPress: () => router.push('/mind') }, { label: 'Comic Wallet', onPress: () => router.push('/wallet') }]} />
    {filtersOpen ? <View style={styles.overlay}><Sheet title="Filter library" onClose={() => setFiltersOpen(false)}>
      <Text style={styles.filterHeading}>Publisher</Text>
      <View style={styles.sheetPills}>
        <Pill label="All" active={comicFilters.publisher === null} onPress={() => setComicFilters((f) => ({ ...f, publisher: null }))} />
        {PUBLISHERS.map((p) => <Pill key={p} label={p!} active={comicFilters.publisher === p} onPress={() => setComicFilters((f) => ({ ...f, publisher: f.publisher === p ? null : p }))} />)}
      </View>
      <Text style={styles.filterHeading}>Writer or artist</Text>
      <Input placeholder="e.g. Alan Moore" value={comicFilters.creator} onChangeText={(v) => setComicFilters((f) => ({ ...f, creator: v }))} />
      <Text style={[styles.filterHeading, { marginTop: 14 }]}>Character</Text>
      <Input placeholder="e.g. Batman, Iron Man" value={comicFilters.character} onChangeText={(v) => setComicFilters((f) => ({ ...f, character: v }))} />
      <Pressable onPress={() => setComicFilters(EMPTY_COMIC_FILTERS)} style={styles.clearFilters}><Text style={styles.clearFiltersText}>Clear filters</Text></Pressable>
      <Pressable onPress={() => setFiltersOpen(false)} style={styles.apply}><Text style={styles.applyText}>Apply filters</Text></Pressable>
    </Sheet></View> : null}
  </AppShell>;
}

function LibraryCell({ item, selecting, picked, downloaded, onToggle }: { item: LibraryItem; selecting: boolean; picked: boolean; downloaded: boolean; onToggle: (workId: string) => void }) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const statusLabel = item.status === 'reading' ? 'Reading' : item.status === 'done' ? 'Read' : item.status === 'dropped' ? 'Dropped' : item.own === 'wishlist' ? 'Wishlist' : item.own === 'ordered' ? 'Ordered' : 'Unread';
  return (
    <View style={styles.gridItem}>
      <View>
        <ComicCover size="fluid" title={item.title} workId={item.workId} recyclingKey={item.workId} status={item.status === 'done' ? '✓' : undefined} onPress={() => (selecting ? onToggle(item.workId) : router.push(`/comic/${item.workId}`))} />
        {downloaded ? <View pointerEvents="none" style={styles.cloud}><Icon name="checkmark-circle" size={16} color="#fff" /></View> : null}
        {picked ? <View pointerEvents="none" style={styles.pickedMark}><Icon name="checkmark-circle" size={34} color="#fff" /></View> : null}
      </View>
      <Text numberOfLines={2} ellipsizeMode="tail" style={[styles.gridTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{item.title}</Text>
      <Text style={[styles.gridStatus, { color: item.status === 'reading' ? c.primary : c.textMuted, fontFamily: typography.bodyMedium }]}>{statusLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 105 }, header: { marginBottom: 2 }, actions: { flexDirection: 'row', gap: 18 }, action: { color: color.text, fontSize: 25 }, actionActive: { color: color.accent }, count: { fontFamily: font.body, fontSize: 13, marginTop: 2 }, subrow: { marginTop: 12, marginBottom: 6 }, playlistsLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.md, paddingHorizontal: space.md, minHeight: 48, borderWidth: 1, borderColor: color.border, borderRadius: radius.md, backgroundColor: color.surface2 }, playlistsLinkText: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle }, playlistsArrow: { color: color.accent, fontSize: 26 }, pills: { gap: 8, paddingVertical: space.lg },
  // The fixed title/status zone makes every three-column grid row start at
  // the same baseline, even when one comic has a much longer title.
  // FlashList assigns the three columns itself. Giving this child another
  // one-third width created a nested three-column calculation, so the first
  // cover overflowed off-screen and every title sat under the wrong column.
  subActions: { flexDirection: 'row', gap: 18 }, subLink: { fontFamily: font.bodySemibold, fontSize: 13 },
  cloud: { position: 'absolute', left: 6, top: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: '#1F9D55', alignItems: 'center', justifyContent: 'center' },
  pickedMark: { ...StyleSheet.absoluteFill, borderRadius: 14, backgroundColor: '#00000066', alignItems: 'center', justifyContent: 'center' },
  bar: { position: 'absolute', left: space.lg, right: space.lg, bottom: 104, flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: space.lg, minHeight: 56, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  barText: { flex: 1, fontFamily: font.bodyMedium, fontSize: 14 }, barBtn: { fontFamily: font.bodySemibold, fontSize: 14 }, barOff: { opacity: 0.35 },
  toast: { position: 'absolute', alignSelf: 'center', bottom: 170, backgroundColor: '#000000DD', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 }, toastText: { color: '#fff', fontFamily: font.bodyMedium, fontSize: 13 },
  gridItem: { width: '100%', paddingHorizontal: 7, paddingBottom: 22 },
  gridTitle: { fontSize: 14, lineHeight: 18, marginTop: 10 },
  gridStatus: { fontSize: 12, marginTop: 3 },
  overlay: { ...StyleSheet.absoluteFill, zIndex: 5, justifyContent: 'flex-end', backgroundColor: '#000000aa' }, filterHeading: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle, marginTop: 8, marginBottom: 10 }, sheetPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 16 }, apply: { minHeight: 50, borderRadius: radius.md, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center', marginTop: 8 }, applyText: { color: color.text, fontFamily: font.bodySemibold, fontSize: type.caption }, clearFilters: { alignItems: 'center', paddingVertical: 10, marginTop: 6 }, clearFiltersText: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.caption },
});
