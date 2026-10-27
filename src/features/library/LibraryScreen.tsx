import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
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
import { EMPTY_COMIC_FILTERS, hasActiveFilters, matchesFilters, type ComicFilters, type PublisherFilter } from '../../lib/util/comicFilters';

type Filter = 'all' | 'owned' | 'reading' | 'read' | 'wishlist';
const filters: Array<[Filter, string]> = [['all', 'All'], ['owned', 'Owned'], ['reading', 'Reading'], ['read', 'Read'], ['wishlist', 'Wishlist']];
const PUBLISHERS: PublisherFilter[] = ['Marvel', 'DC', 'Indie', 'Manga'];

export default function LibraryScreen() {
  const layout = useLayout(); const cols = layout.columns(170);
  const library = useLibrary(); const [filter, setFilter] = useState<Filter>('all'); const [query, setQuery] = useState(''); const [filtersOpen, setFiltersOpen] = useState(false); const [moreOpen, setMoreOpen] = useState(false); const c0 = useAppearance().theme.colors;
  const [comicFilters, setComicFilters] = useState<ComicFilters>(EMPTY_COMIC_FILTERS);
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
    || (filter === 'reading' && item.status === 'reading')
    || (filter === 'read' && item.status === 'done')
    // Ordered books are paid for but not yet available to read, so they stay
    // with the buy queue rather than the owned/reading collection.
    || (filter === 'wishlist' && (item.own === 'wishlist' || item.own === 'ordered'))
  )
    // Travel mode: only what's actually reachable without a physical shelf.
    && (!digitalOnly || isFormatOwned(item.own, 'digital'))
    && matchesFilters(item, comicFilters)
    && item.title.toLowerCase().includes(query.toLowerCase())), [inLibrary, filter, query, digitalOnly, comicFilters]);
  const ownedCount = useMemo(() => inLibrary.filter((item) => isAccessible(item.own)).length, [inLibrary]);
  const filtersActive = hasActiveFilters(comicFilters);
  return <AppShell active="library" back title="My Collection" right={<HeaderActions><HeaderButton icon="search" label="Search" active={!!query} onPress={() => setQuery(query ? '' : 'a')} /><HeaderButton icon="scan-outline" label="Scan or add comics" onPress={() => router.push('/scan')} /><HeaderButton icon="options-outline" label="Filter" active={filtersActive} onPress={() => setFiltersOpen(true)} /><HeaderButton icon="ellipsis-horizontal" label="More" onPress={() => setMoreOpen(true)} /></HeaderActions>}>
    <FlashList key={`grid-${cols}`} data={items} numColumns={cols} keyExtractor={(item) => item.workId} getItemType={() => 'cover-grid'} renderItem={({ item }) => <LibraryCell item={item} />} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} ListHeaderComponent={<><View style={styles.header}>{query ? <Input placeholder="Search titles, creators, characters" value={query} onChangeText={setQuery} /> : null}<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>{filters.map(([id, label]) => <Pill key={id} label={label} active={filter === id} onPress={() => setFilter(id)} />)}</ScrollView><View style={styles.subrow}><Text style={[styles.count, { color: c0.textMuted }]}>{ownedCount} {ownedCount === 1 ? 'comic' : 'comics'}</Text></View></View></>} ListEmptyComponent={<EmptyState title="Nothing here yet" copy={query ? 'Try a title, creator, or character.' : 'Your collection is ready for its first great comic.'} action={!query ? 'Browse catalog' : undefined} onAction={!query ? () => router.push('/discover') : undefined} />}/>
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

function LibraryCell({ item }: { item: LibraryItem }) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const statusLabel = item.status === 'reading' ? 'Reading' : item.status === 'done' ? 'Read' : item.status === 'dropped' ? 'Dropped' : item.own === 'wishlist' ? 'Wishlist' : item.own === 'ordered' ? 'Ordered' : 'Unread';
  return (
    <View style={styles.gridItem}>
      <ComicCover size="fluid" title={item.title} workId={item.workId} recyclingKey={item.workId} status={item.status === 'done' ? '✓' : undefined} onPress={() => router.push(`/comic/${item.workId}`)} />
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
  gridItem: { width: '100%', paddingHorizontal: 7, paddingBottom: 22 },
  gridTitle: { fontSize: 14, lineHeight: 18, marginTop: 10 },
  gridStatus: { fontSize: 12, marginTop: 3 },
  overlay: { ...StyleSheet.absoluteFill, zIndex: 5, justifyContent: 'flex-end', backgroundColor: '#000000aa' }, filterHeading: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle, marginTop: 8, marginBottom: 10 }, sheetPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 16 }, apply: { minHeight: 50, borderRadius: radius.md, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center', marginTop: 8 }, applyText: { color: color.text, fontFamily: font.bodySemibold, fontSize: type.caption }, clearFilters: { alignItems: 'center', paddingVertical: 10, marginTop: 6 }, clearFiltersText: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.caption },
});
