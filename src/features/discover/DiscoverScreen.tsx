import { SwipeDeck } from './SwipeDeck';
import { HeaderActions, HeaderButton } from '../../ui/Icon';
import { useAppearance } from '../../ui/theme';
import { useLayout } from '../../ui/layout';
import { useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { sqlite } from '../../lib/db/client';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CoverStack } from '../../ui/CoverStack';
import { PressableScale } from '../../ui/PressableScale';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useDiscover } from './useDiscover';
import { AppShell } from '../../ui/AppShell';
import { ComicCover, coverSourceFor } from '../../ui/comic';
import { Button, EmptyState, Input, Pill, Sheet } from '../../ui/primitives';
import { color, font, radius, space, type } from '../../ui/tokens';
import { isAccessible } from '../../lib/util/own';
import { EMPTY_COMIC_FILTERS, type PublisherFilter } from '../../lib/util/comicFilters';

const PUBLISHERS: PublisherFilter[] = ['Marvel', 'DC', 'Indie', 'Manga'];

export default function DiscoverScreen() {
  const layout = useLayout(); const cols = layout.columns(layout.isTablet ? 220 : 170);
  const discover = useDiscover(); const [rating, setRating] = useState(false); const [filtersOpen, setFiltersOpen] = useState(false); const query = '';
  const catalog = useMemo(() => discover.catalog.filter((work) => work.title.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => Number(b.workId.startsWith('file-')) - Number(a.workId.startsWith('file-'))), [discover.catalog, query]);
  return <AppShell active="discover" title="Discover" right={<HeaderActions><HeaderButton icon="heart-outline" label="Wishlist" onPress={() => router.push('/collection')} /><HeaderButton icon="search" label="Search" onPress={() => router.push('/search')} /><HeaderButton icon="options-outline" label="Filter" active={discover.filtersActive} onPress={() => setFiltersOpen(true)} /></HeaderActions>}>
    <FlashList key={`grid-${cols}`} data={catalog} numColumns={cols} keyExtractor={(item) => item.workId} getItemType={() => 'discover-cover-grid'} renderItem={({ item }) => <CatalogCell item={item} />} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} ListHeaderComponent={<DiscoverHeader discover={discover} catalogCount={catalog.length} openRating={() => setRating(true)} />} ListEmptyComponent={<EmptyState mark="⌕" title="No catalog matches" copy="Try another title or clear a filter." action="Clear filters" onAction={() => { discover.setFilters(EMPTY_COMIC_FILTERS); }} />} />
    {rating ? <View style={styles.overlay}><Sheet title="Quick rate" onClose={() => setRating(false)}><Text style={styles.rateCopy}>A small signal goes a long way.</Text><View style={styles.rateButtons}><Button kind="secondary" onPress={() => { discover.rate(1); setRating(false); }}>Meh</Button><Button kind="secondary" onPress={() => { discover.rate(2); setRating(false); }}>Good</Button><Button onPress={() => { discover.rate(3); setRating(false); }}>Loved</Button></View></Sheet></View> : null}
    {filtersOpen ? <View style={styles.overlay}><Sheet title="Filter discover" onClose={() => setFiltersOpen(false)}><Text style={styles.filterHeading}>Publisher</Text><View style={styles.sheetPills}><Pill label="All" active={discover.filters.publisher === null} onPress={() => discover.setFilters({ ...discover.filters, publisher: null })} />{PUBLISHERS.map((publisher) => <Pill key={publisher} label={publisher!} active={discover.filters.publisher === publisher} onPress={() => discover.setFilters({ ...discover.filters, publisher: discover.filters.publisher === publisher ? null : publisher })} />)}</View><Text style={styles.filterHeading}>Writer or artist</Text><Input placeholder="e.g. Alan Moore" value={discover.filters.creator} onChangeText={(creator) => discover.setFilters({ ...discover.filters, creator })} /><Text style={[styles.filterHeading, { marginTop: 14 }]}>Character</Text><Input placeholder="e.g. Batman, Iron Man" value={discover.filters.character} onChangeText={(character) => discover.setFilters({ ...discover.filters, character })} /><Pressable onPress={() => discover.setFilters(EMPTY_COMIC_FILTERS)} style={styles.clearFilters}><Text style={styles.clearFiltersText}>Clear filters</Text></Pressable><Pressable onPress={() => setFiltersOpen(false)} style={styles.apply}><Text style={styles.applyText}>Apply filters</Text></Pressable></Sheet></View> : null}
  </AppShell>;
}

function Featured({ discover }: { discover: ReturnType<typeof useDiscover> }) {
  const layout = useLayout(); const { theme, typography } = useAppearance(); const c = theme.colors;
  const width = layout.maxContent;
  const [page, setPage] = useState(0);
  const picks = discover.essentials;
  const pageW = width - space.lg * 2;
  const slides = picks.slice(0, 5).map((pick, i) => ({ pick, fan: [picks[(i + 1) % picks.length], picks[(i + 2) % picks.length]].filter((p) => p && p.work.id !== pick.work.id) }));
  if (!slides.length) return null;
  return (
    <View>
      <ScrollView horizontal pagingEnabled snapToInterval={pageW + 12} decelerationRate="fast" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}
        onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (pageW + 12)))} scrollEventThrottle={32}>
        {slides.map(({ pick, fan }) => {
          const backdrop = coverSourceFor(pick.work.id);
          const genre = (pick.work.genres?.[0] ?? 'Featured').toUpperCase();
          return (
            <PressableScale key={pick.work.id} to={0.98} style={[styles.featured, { width: pageW, backgroundColor: c.surface }]} onPress={() => router.push(`/comic/${pick.work.id}`)}>
              {backdrop ? <Image source={backdrop} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={42} /> : null}
              <LinearGradient pointerEvents="none" colors={['#0A0A0D55', '#0A0A0DEE']} style={StyleSheet.absoluteFill} />
              <View style={{ alignItems: 'center' }}><CoverStack width={layout.isTablet ? 176 : 118} items={[{ title: pick.work.title, workId: pick.work.id }, ...fan.map((f) => ({ title: f.work.title, workId: f.work.id }))]} /></View>
              <Text style={[styles.featuredGenre, { color: c.textSecondary, fontFamily: typography.bodySemibold }]}>{genre}</Text>
              <Text numberOfLines={2} style={[styles.featuredTitle, { color: c.textPrimary, fontFamily: typography.display }]}>{pick.work.title}</Text>
              <Text style={[styles.featuredSub, { color: c.textSecondary, fontFamily: typography.body }]}>{fan.length + 1} picks for you</Text>
            </PressableScale>
          );
        })}
      </ScrollView>
      <View style={styles.dots}>{slides.map((_, i) => <View key={i} style={[styles.dot, { backgroundColor: i === page ? c.textPrimary : c.textMuted, opacity: i === page ? 1 : 0.4 }]} />)}</View>
    </View>
  );
}

function DiscoverHeader({ discover, catalogCount, openRating }: { discover: ReturnType<typeof useDiscover>; catalogCount: number; openRating: () => void }) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const card = discover.current;
  const fresh = discover.catalog.filter((w) => w.own === 'none').slice(0, 12);
  // Everything imported through Read Files shows up here at the top, whether it matched a catalog book or became a new entry.
  const mine = useMemo(() => {
    try {
      const ids = new Set(sqlite.getAllSync<{ work_id: string }>('SELECT DISTINCT work_id FROM reader_comics WHERE work_id IS NOT NULL').map((r) => r.work_id));
      return discover.catalog.filter((w) => ids.has(w.workId));
    } catch { return []; }
  }, [discover.catalog]);
  return (
    <Animated.View entering={FadeInDown.duration(380)} style={styles.header}>
      <Featured discover={discover} />
      {mine.length ? (
        <>
          <Text style={[styles.sectionHead, { color: c.textPrimary, fontFamily: typography.display }]}>On your phone</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {mine.map((w) => (
              <PressableScale key={w.workId} to={0.96} style={styles.stripItem} onPress={() => router.push(`/comic/${w.workId}`)}>
                <ComicCover size="grid" title={w.title} workId={w.workId} recyclingKey={`mine-${w.workId}`} />
                <Text numberOfLines={2} style={[styles.stripTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{w.title}</Text>
              </PressableScale>
            ))}
          </ScrollView>
        </>
      ) : null}
      {fresh.length ? (
        <>
          <Text style={[styles.sectionHead, { color: c.textPrimary, fontFamily: typography.display }]}>New to you</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {fresh.map((w) => (
              <PressableScale key={w.workId} to={0.96} style={styles.stripItem} onPress={() => router.push(`/comic/${w.workId}`)}>
                <ComicCover size="grid" title={w.title} workId={w.workId} recyclingKey={`new-${w.workId}`} />
                <Text numberOfLines={2} style={[styles.stripTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{w.title}</Text>
              </PressableScale>
            ))}
          </ScrollView>
        </>
      ) : null}
      <Text style={[styles.sectionHead, { color: c.textPrimary, fontFamily: typography.display }]}>Swipe to decide</Text>
      {card ? <SwipeDeck key={card.work.id} card={card} next={discover.deck[discover.index + 1] ?? null} onPass={discover.pass} onSave={discover.read} onRate={openRating} /> : <EmptyState mark="✦" title={discover.filtersActive ? 'Nothing matches those filters.' : 'That’s enough for now.'} copy={discover.filtersActive ? 'Try a broader publisher, creator, or character.' : 'A small deck makes room for better decisions.'} action={discover.filtersActive ? 'Clear filters' : 'Start again'} onAction={discover.filtersActive ? () => discover.setFilters(EMPTY_COMIC_FILTERS) : discover.reset} />}
      <Text style={[styles.sectionHead, { color: c.textPrimary, fontFamily: typography.display, marginBottom: 2 }]}>Browse all comics</Text>
      <Text style={[styles.catalogCopy, { color: c.textMuted, fontFamily: typography.body }]}>{discover.filtersActive ? `${catalogCount} matches` : `${catalogCount} comics in the catalog`}</Text>
    </Animated.View>
  );
}

function CatalogCell({ item }: { item: ReturnType<typeof useDiscover>['catalog'][number] }) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const inLibrary = item.own !== 'none';
  return (
    <View style={styles.gridItem}>
      <ComicCover size="fluid" title={item.title} workId={item.workId} recyclingKey={item.workId} status={inLibrary ? '✓' : undefined} onPress={() => router.push(`/comic/${item.workId}`)} />
      <Text numberOfLines={2} ellipsizeMode="tail" style={[styles.gridTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{item.title}</Text>
      {inLibrary ? <Text style={[styles.gridStatus, { color: c.success, fontFamily: typography.bodyMedium }]}>In your library</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  featured: { borderRadius: 28, overflow: 'hidden', paddingTop: 26, paddingBottom: 22, paddingHorizontal: 16, alignItems: 'center' },
  featuredGenre: { fontSize: 10.5, letterSpacing: 1.6, marginTop: 6 },
  featuredTitle: { fontSize: 26, lineHeight: 30, letterSpacing: -0.5, textAlign: 'center', marginTop: 8 },
  featuredSub: { fontSize: 13, marginTop: 6 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 7, marginTop: 14 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  sectionHead: { fontSize: 22, letterSpacing: -0.4, marginTop: 28, marginBottom: 12 },
  strip: { gap: 14, paddingRight: 16 },
  stripItem: { width: 100, gap: 8 },
  stripTitle: { fontSize: 12.5, lineHeight: 16 },
  content: { padding: space.lg, paddingBottom: 105 }, actions: { flexDirection: 'row', gap: 18 }, action: { color: color.text, fontSize: 25 }, actionActive: { color: color.accent }, header: { marginBottom: space.lg }, filters: { gap: 8, paddingVertical: 4 }, essentials: { marginTop: 18 }, essentialsHeading: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle, marginBottom: 10 }, essentialsRow: { gap: 12 }, essentialItem: { width: 60, alignItems: 'center' }, essentialTitle: { color: color.muted, fontFamily: font.bodyMedium, fontSize: 10, textAlign: 'center', marginTop: 6, lineHeight: 12 }, deck: { minHeight: 370, justifyContent: 'center', alignItems: 'center', marginTop: 8 }, ghost: { position: 'absolute', width: '82%', height: 350, borderRadius: radius.lg, backgroundColor: color.surface2, transform: [{ rotate: '4deg' }], top: 37 }, card: { width: '88%', backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: radius.lg, padding: 16, flexDirection: 'row', gap: 14, shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 18, elevation: 9 }, info: { flex: 1, minWidth: 0, justifyContent: 'center' }, title: { color: color.text, fontFamily: font.display, fontSize: 25, lineHeight: 29 }, meta: { color: color.accent, fontFamily: font.bodyMedium, fontSize: 12, marginTop: 7, textTransform: 'capitalize' }, owned: { color: color.faint, fontFamily: font.bodyMedium, fontSize: 11, marginTop: 4 }, copy: { color: color.muted, fontFamily: font.body, fontSize: 12, lineHeight: 18, marginTop: 12 }, controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 }, pass: { alignItems: 'center', gap: 4 }, rate: { alignItems: 'center', gap: 4 }, read: { alignItems: 'center', gap: 4 }, passIcon: { color: color.muted, fontSize: 33, width: 57, height: 57, textAlign: 'center', textAlignVertical: 'center', borderWidth: 1, borderColor: color.border, borderRadius: 29 }, rateIcon: { color: color.text, fontSize: 25, width: 42, height: 42, textAlign: 'center', textAlignVertical: 'center', borderRadius: 21, backgroundColor: color.surface2 }, readIcon: { color: color.text, fontSize: 24, width: 57, height: 57, textAlign: 'center', textAlignVertical: 'center', borderRadius: 29, backgroundColor: color.accent }, controlText: { color: color.muted, fontFamily: font.bodyMedium, fontSize: 11 }, help: { color: color.faint, fontFamily: font.body, fontSize: 12, textAlign: 'center', marginTop: 15 }, catalogHeading: { color: color.text, fontFamily: font.displayMedium, fontSize: type.title, marginTop: space.xxl }, catalogCopy: { color: color.muted, fontFamily: font.body, fontSize: type.caption, marginTop: 4, marginBottom: space.md }, gridItem: { width: '100%', paddingHorizontal: 7, paddingBottom: 22 }, gridTitle: { fontSize: 14, lineHeight: 18, marginTop: 10 }, gridStatus: { fontSize: 12, marginTop: 3 }, libraryBadge: { minHeight: 17, borderRadius: radius.pill, backgroundColor: color.positive + '28', paddingHorizontal: 6, justifyContent: 'center' }, libraryBadgeText: { color: color.positive, fontFamily: font.bodySemibold, fontSize: 9, lineHeight: 13 }, badgeSpace: { height: 17 }, overlay: { ...StyleSheet.absoluteFill, zIndex: 5, justifyContent: 'flex-end', backgroundColor: '#000000aa' }, filterHeading: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle, marginTop: 8, marginBottom: 10 }, sheetPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 16 }, apply: { minHeight: 50, borderRadius: radius.md, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center', marginTop: 8 }, applyText: { color: color.text, fontFamily: font.bodySemibold, fontSize: type.caption }, clearFilters: { alignItems: 'center', paddingVertical: 10, marginTop: 6 }, clearFiltersText: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.caption }, rateCopy: { color: color.muted, fontFamily: font.body, fontSize: type.body, marginBottom: 14 }, rateButtons: { gap: 8 },
});
