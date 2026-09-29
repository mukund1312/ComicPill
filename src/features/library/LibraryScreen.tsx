import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useLibrary, type LibraryItem } from './useLibrary';
import { AppShell } from '../../ui/AppShell';
import { ComicCover } from '../../ui/comic';
import { EmptyState, Input, Pill, Sheet } from '../../ui/primitives';
import { color, font, radius, space, type } from '../../ui/tokens';
import { isAccessible, isFormatOwned } from '../../lib/util/own';
import { useTravelMode } from '../../lib/state/travelMode';

type Filter = 'all' | 'owned' | 'reading' | 'read' | 'wishlist';
const filters: Array<[Filter, string]> = [['all', 'All'], ['owned', 'Owned'], ['reading', 'Reading'], ['read', 'Read'], ['wishlist', 'Wishlist']];

export default function LibraryScreen() {
  const library = useLibrary(); const [filter, setFilter] = useState<Filter>('all'); const [query, setQuery] = useState(''); const [filtersOpen, setFiltersOpen] = useState(false);
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
    && item.title.toLowerCase().includes(query.toLowerCase())), [inLibrary, filter, query, digitalOnly]);
  const ownedCount = useMemo(() => inLibrary.filter((item) => isAccessible(item.own)).length, [inLibrary]);
  return <AppShell active="library" title="My Library" right={<View style={styles.actions}><Pressable onPress={() => setQuery(query ? '' : 'a')}><Text style={styles.action}>⌕</Text></Pressable><Pressable onPress={() => setFiltersOpen(true)}><Text style={styles.action}>☷</Text></Pressable></View>}>
    <FlashList data={items} numColumns={3} keyExtractor={(item) => item.workId} getItemType={() => 'cover-grid'} renderItem={({ item }) => <LibraryCell item={item} />} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} ListHeaderComponent={<><View style={styles.header}>{query ? <Input placeholder="Search titles, creators, characters" value={query} onChangeText={setQuery} /> : null}<Text style={styles.count}>{ownedCount} comics · your collection</Text><Pressable accessibilityRole="button" onPress={() => router.push('/playlists')} style={styles.playlistsLink}><Text style={styles.playlistsLinkText}>Playlists</Text><Text style={styles.playlistsArrow}>›</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.push('/wallet')} style={styles.playlistsLink}><Text style={styles.playlistsLinkText}>Comic Wallet</Text><Text style={styles.playlistsArrow}>›</Text></Pressable><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>{filters.map(([id, label]) => <Pill key={id} label={label} active={filter === id} onPress={() => setFilter(id)} />)}</ScrollView></View></>} ListEmptyComponent={<EmptyState title="Nothing here yet" copy={query ? 'Try a title, creator, or character.' : 'Your collection is ready for its first great comic.'} action={!query ? 'Browse catalog' : undefined} onAction={!query ? () => router.push('/discover') : undefined} />}/>
    {filtersOpen ? <View style={styles.overlay}><Sheet title="Filter library"><Text style={styles.filterHeading}>Ownership</Text><View style={styles.sheetPills}>{['Owned', 'Physical', 'Digital', 'Both', 'Not owned'].map((label) => <Pill key={label} label={label} />)}</View><Text style={styles.filterHeading}>Reading status</Text><View style={styles.sheetPills}>{['Unread', 'Reading', 'Finished', 'Dropped', 'Wishlist'].map((label) => <Pill key={label} label={label} />)}</View><Pressable onPress={() => setFiltersOpen(false)} style={styles.apply}><Text style={styles.applyText}>Apply filters</Text></Pressable></Sheet></View> : null}
  </AppShell>;
}

function LibraryCell({ item }: { item: LibraryItem }) {
  const statusLabel = item.status !== 'none' ? item.status
    : item.own === 'wishlist' ? 'Wishlist'
    : item.own === 'ordered' ? 'Ordered'
    : 'Unread';
  return <View style={styles.gridItem}><ComicCover title={item.title} workId={item.workId} recyclingKey={item.workId} status={item.status === 'done' ? '✓' : undefined} onPress={() => router.push(`/comic/${item.workId}`)} /><Text numberOfLines={3} ellipsizeMode="tail" style={styles.gridTitle}>{item.title}</Text><Text style={[styles.gridStatus, item.status === 'reading' && { color: color.accent }]}>{statusLabel}</Text></View>;
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 105 }, header: { marginBottom: 2 }, actions: { flexDirection: 'row', gap: 18 }, action: { color: color.text, fontSize: 25 }, count: { color: color.muted, fontFamily: font.body, fontSize: type.caption, marginTop: 8 }, playlistsLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.md, paddingHorizontal: space.md, minHeight: 48, borderWidth: 1, borderColor: color.border, borderRadius: radius.md, backgroundColor: color.surface2 }, playlistsLinkText: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle }, playlistsArrow: { color: color.accent, fontSize: 26 }, pills: { gap: 8, paddingVertical: space.lg },
  // The fixed title/status zone makes every three-column grid row start at
  // the same baseline, even when one comic has a much longer title.
  // FlashList assigns the three columns itself. Giving this child another
  // one-third width created a nested three-column calculation, so the first
  // cover overflowed off-screen and every title sat under the wrong column.
  gridItem: { width: '100%', minHeight: 229, paddingHorizontal: 2, paddingBottom: 18, alignItems: 'center' },
  gridTitle: { width: 96, height: 45, color: color.text, fontFamily: font.displayMedium, fontSize: 12, lineHeight: 15, marginTop: 7, textAlign: 'center' },
  gridStatus: { width: 96, minHeight: 14, color: color.faint, fontFamily: font.bodyMedium, fontSize: 11, lineHeight: 14, marginTop: 3, textAlign: 'center', textTransform: 'capitalize' },
  overlay: { ...StyleSheet.absoluteFill, zIndex: 5, justifyContent: 'flex-end', backgroundColor: '#000000aa' }, filterHeading: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle, marginTop: 8, marginBottom: 10 }, sheetPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 16 }, apply: { minHeight: 50, borderRadius: radius.md, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center', marginTop: 8 }, applyText: { color: color.text, fontFamily: font.bodySemibold, fontSize: type.caption },
});
