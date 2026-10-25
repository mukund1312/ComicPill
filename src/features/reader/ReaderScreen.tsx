import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent, type ViewToken } from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThumbnailStrip } from './ThumbnailStrip';
import { ZoomableView } from './ZoomableView';
import { ComicOpenError, openComicSource, type ComicSource, type PageSize } from '../../lib/reader/ComicSource';
import { buildUnits, unitIndexOf } from '../../lib/reader/formats/spreads';
import {
  getReaderComic, listBookmarks, saveReaderMode, saveReaderProgress, saveReaderSizes, toggleBookmark,
  type ReaderComic, type ReaderMode,
} from '../../lib/reader/readerLibrary';
import { color, font, radius, space, type } from '../../ui/tokens';

type Sizes = Array<PageSize | null>;

const MODES: Array<[ReaderMode, string]> = [['ltr', 'Left → Right'], ['rtl', 'Manga (RTL)'], ['webtoon', 'Webtoon']];
const DEFAULT_RATIO = 0.66;
const WEBTOON_FALLBACK_RATIO = 1.5;

/** Reads every page's shape once (cheap header reads) and remembers it, so reopening is instant. */
async function loadSizes(comic: ReaderComic, source: ComicSource, isLive: () => boolean): Promise<Sizes | null> {
  if (comic.sizes && comic.sizes.length === source.pageCount) return comic.sizes;
  if (!source.cheapSizes) return null;
  const sizes: Sizes = [];
  for (let i = 0; i < source.pageCount; i++) {
    if (!isLive()) return null;
    sizes.push(await source.getPageSize(i));
    if (i % 25 === 24) await new Promise((r) => setTimeout(r, 0)); // keep the UI thread breathing
  }
  saveReaderSizes(comic.id, sizes);
  return sizes;
}

export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [comic] = useState<ReaderComic | null>(() => (id ? getReaderComic(id) : null));
  const [source, setSource] = useState<ComicSource | null>(null);
  const [sizes, setSizes] = useState<Sizes | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(comic ? null : 'Comic not found.');

  useKeepAwake();

  // The app is portrait-only elsewhere; the reader may rotate so landscape can show two pages.
  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => undefined);
    return () => { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined); };
  }, []);

  useEffect(() => {
    if (!comic) return;
    let live = true; let opened: ComicSource | null = null;
    (async () => {
      try {
        const s = await openComicSource(comic.path, `read-${comic.id}`);
        if (!live) { s.close(); return; }
        opened = s; setSource(s);
        const result = await loadSizes(comic, s, () => live);
        if (live) setSizes(result);
      } catch (e) {
        if (live) setError(e instanceof ComicOpenError ? e.message : 'Could not open this comic.');
      }
    })();
    return () => { live = false; opened?.close(); };
  }, [comic]);

  if (error) return <View style={styles.center}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => router.back()} style={styles.button}><Text style={styles.buttonText}>Back</Text></Pressable></View>;
  if (!comic || !source || sizes === undefined) return <View style={styles.center}><ActivityIndicator color={color.accent} /><Text style={styles.errorText}>Preparing pages…</Text></View>;
  return <Reader comic={comic} source={source} sizes={sizes} />;
}

type Position = { page: number; frac: number };

function Reader({ comic, source, sizes }: { comic: ReaderComic; source: ComicSource; sizes: Sizes | null }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const total = source.pageCount;
  const [mode, setMode] = useState<ReaderMode>(comic.mode);
  const [overlay, setOverlay] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [bookmarks, setBookmarks] = useState<Set<number>>(() => new Set(listBookmarks(comic.id)));
  const startPage = Math.min(comic.progressPage, total - 1);
  const [page, setPage] = useState(startPage);
  const [anchor, setAnchor] = useState<Position>({ page: startPage, frac: comic.progressOffset });
  // Live position (updates every scroll); `anchor` is its last saved mirror, safe to read in render.
  const position = useRef<Position>({ page: startPage, frac: comic.progressOffset });
  const listRef = useRef<FlatList<number[]>>(null);

  const rtl = mode === 'rtl'; const webtoon = mode === 'webtoon';
  const spread = width > height && !webtoon;
  const sizeList: Sizes = useMemo(() => sizes ?? Array.from({ length: total }, () => null), [sizes, total]);

  const units = useMemo(() => buildUnits(sizeList, spread), [sizeList, spread]);
  const data = useMemo(() => (rtl ? [...units].reverse() : units), [units, rtl]);
  const visualIndex = useCallback((p: number) => { const i = unitIndexOf(units, p); return rtl ? units.length - 1 - i : i; }, [units, rtl]);

  // Webtoon geometry: exact when every page size is known, estimated otherwise.
  const strip = useMemo(() => {
    const known = sizes != null && sizes.every((s) => s != null);
    const heights = sizeList.map((s) => (s ? (width * s.height) / s.width : width * WEBTOON_FALLBACK_RATIO));
    const offsets: number[] = []; let y = 0;
    for (const h of heights) { offsets.push(y); y += h; }
    return { known, heights, offsets };
  }, [sizes, sizeList, width]);

  const persist = useCallback(() => {
    saveReaderProgress(comic.id, position.current.page, webtoon ? position.current.frac : 0);
    setAnchor(position.current);
  }, [comic.id, webtoon]);

  // Leave exactly where you were: save on background and on exit as well as on every turn.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') persist(); });
    return () => { sub.remove(); persist(); };
  }, [persist]);

  const goToPage = useCallback((p: number, animated = true) => {
    const target = Math.max(0, Math.min(total - 1, p));
    if (webtoon) {
      if (strip.known) listRef.current?.scrollToOffset({ offset: strip.offsets[target], animated });
      else listRef.current?.scrollToIndex({ index: target, animated });
    } else {
      listRef.current?.scrollToIndex({ index: visualIndex(target), animated });
    }
  }, [total, webtoon, strip, visualIndex]);

  const step = useCallback((delta: number) => {
    const at = unitIndexOf(units, position.current.page);
    const next = Math.max(0, Math.min(units.length - 1, at + delta));
    goToPage(units[next][0]);
  }, [units, goToPage]);

  const onViewable = useCallback(({ viewableItems }: { viewableItems: Array<ViewToken<number[]>> }) => {
    if (webtoon && strip.known) return; // scroll offset is the source of truth there
    const first = viewableItems.find((v) => v.isViewable && v.item);
    if (!first?.item) return;
    const p = first.item[0];
    position.current = { page: p, frac: 0 };
    setPage(p); persist();
  }, [webtoon, strip.known, persist]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!webtoon || !strip.known) return;
    const y = e.nativeEvent.contentOffset.y;
    let lo = 0; let hi = total - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (strip.offsets[mid] <= y) lo = mid; else hi = mid - 1; }
    position.current = { page: lo, frac: Math.min(1, Math.max(0, (y - strip.offsets[lo]) / strip.heights[lo])) };
    setPage((prev) => (prev === lo ? prev : lo));
  }, [webtoon, strip, total]);

  const onTap = useCallback((x: number) => {
    const edge = width * 0.3;
    // Outer thirds turn the page (direction-aware); the centre toggles the overlay.
    if (x < edge) step(rtl ? 1 : -1);
    else if (x > width - edge) step(rtl ? -1 : 1);
    else setOverlay((o) => !o);
  }, [width, rtl, step]);

  // Prefetch what's coming (and one back) and tell the source where we are so it never evicts them.
  useEffect(() => {
    source.setFocus(page);
    const ahead = spread ? [2, 3, 4, -1] : webtoon ? [1, 2, 3, -1] : [1, 2, -1];
    for (const d of ahead) {
      const p = page + d;
      if (p >= 0 && p < total) source.getPageUri(p).then((u) => Image.prefetch(u)).catch(() => undefined);
    }
  }, [page, source, total, spread, webtoon]);

  const changeMode = (next: ReaderMode) => { persist(); setMode(next); saveReaderMode(comic.id, next); setOverlay(false); };

  const onToggleBookmark = () => {
    const now = toggleBookmark(comic.id, page);
    setBookmarks((prev) => { const n = new Set(prev); if (now) n.add(page); else n.delete(page); return n; });
  };

  const allPages = useMemo(() => { const p = Array.from({ length: total }, (_, i) => i); return rtl ? p.reverse() : p; }, [total, rtl]);
  const listKey = `${mode}-${spread ? 'spread' : 'single'}-${Math.round(width)}`;
  const initial = anchor.page;
  const webtoonStartY = strip.known ? strip.offsets[initial] + anchor.frac * strip.heights[initial] : 0;

  return (
    <View style={styles.root}>
      <StatusBar hidden={!overlay} />
      <FlatList
        key={listKey}
        ref={listRef}
        data={data}
        keyExtractor={(u) => String(u[0])}
        horizontal={!webtoon}
        pagingEnabled={!webtoon}
        initialScrollIndex={!webtoon ? visualIndex(initial) : strip.known ? undefined : initial}
        contentOffset={webtoon && strip.known ? { x: 0, y: webtoonStartY } : undefined}
        getItemLayout={webtoon
          ? (strip.known ? (_, i) => ({ length: strip.heights[i], offset: strip.offsets[i], index: i }) : undefined)
          : (_, i) => ({ length: width, offset: width * i, index: i })}
        initialNumToRender={webtoon ? 4 : 2}
        windowSize={webtoon ? 7 : 5}
        maxToRenderPerBatch={2}
        removeClippedSubviews
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        onScroll={onScroll}
        scrollEventThrottle={32}
        onScrollEndDrag={persist}
        onMomentumScrollEnd={persist}
        onScrollToIndexFailed={({ index }) => setTimeout(() => listRef.current?.scrollToIndex({ index, animated: false }), 100)}
        renderItem={({ item }) => webtoon
          ? <WebtoonPage source={source} page={item[0]} width={width} height={strip.known ? strip.heights[item[0]] : undefined} onTap={() => setOverlay((o) => !o)} />
          : <PagedUnit source={source} unit={item} sizes={sizeList} width={width} height={height} rtl={rtl} onTap={onTap} />}
      />
      {overlay ? <>
        <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹</Text></Pressable>
          <Text numberOfLines={1} style={styles.title}>{comic.title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={bookmarks.has(page) ? 'Remove bookmark' : 'Add bookmark'} onPress={onToggleBookmark} hitSlop={10}>
            <Text style={[styles.icon, bookmarks.has(page) && styles.iconActive]}>{bookmarks.has(page) ? '★' : '☆'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Bookmarks" onPress={() => setBookmarksOpen(true)} hitSlop={10}><Text style={styles.icon}>☰</Text></Pressable>
        </View>
        <View style={[styles.bottom, { paddingBottom: insets.bottom + space.md }]}>
          <ThumbnailStrip key={rtl ? 'r' : 'l'} source={source} pages={allPages} current={page} bookmarks={bookmarks} onSelect={(p) => goToPage(p, false)} />
          <Scrubber page={page} total={total} rtl={rtl} onSeek={(p) => goToPage(p, false)} />
          <Text style={styles.counter}>{page + 1} / {total}</Text>
          <View style={styles.modes}>
            {MODES.map(([m, label]) => (
              <Pressable key={m} onPress={() => changeMode(m)} style={[styles.mode, mode === m && styles.modeActive]}>
                <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </> : null}
      {bookmarksOpen ? (
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Bookmarks</Text>
              <Pressable onPress={() => setBookmarksOpen(false)} hitSlop={10}><Text style={styles.icon}>✕</Text></Pressable>
            </View>
            {bookmarks.size === 0 ? <Text style={styles.empty}>No bookmarks yet. Tap ☆ on a page to add one.</Text> : (
              <FlatList
                data={[...bookmarks].sort((a, b) => a - b)}
                keyExtractor={(p) => String(p)}
                renderItem={({ item }) => (
                  <Pressable style={styles.row} onPress={() => { setBookmarksOpen(false); goToPage(item, false); }}>
                    <Text style={styles.rowText}>Page {item + 1}</Text>
                    <Pressable onPress={() => { toggleBookmark(comic.id, item); setBookmarks((prev) => { const n = new Set(prev); n.delete(item); return n; }); }} hitSlop={10}><Text style={styles.rowRemove}>Remove</Text></Pressable>
                  </Pressable>
                )}
              />
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function PageImage({ source, page, width, height }: { source: ComicSource; page: number; width: number; height: number }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    source.getPageUri(page).then((u) => { if (live) setUri(u); }).catch(() => undefined);
    return () => { live = false; };
  }, [source, page]);
  return <View style={{ width, height }}>{uri ? <Image source={{ uri }} style={styles.fill} contentFit="contain" recyclingKey={uri} /> : null}</View>;
}

/** One screen of paged reading: a single page, or two side by side (landscape). Zoom applies to the whole unit. */
function PagedUnit({ source, unit, sizes, width, height, rtl, onTap }: { source: ComicSource; unit: number[]; sizes: Sizes; width: number; height: number; rtl: boolean; onTap: (x: number) => void }) {
  const known = unit.every((p) => sizes[p]);
  const ratios = unit.map((p) => (sizes[p] ? sizes[p]!.width / sizes[p]!.height : DEFAULT_RATIO));
  const sumRatio = ratios.reduce((a, b) => a + b, 0);
  // Known shapes: size the unit to its exact fit so pan limits follow the picture, not the screen.
  const fitH = known ? Math.min(height, width / sumRatio) : height;
  const widths = known ? ratios.map((r) => r * fitH) : unit.map(() => width / unit.length);
  const contentW = widths.reduce((a, b) => a + b, 0);
  return (
    <ZoomableView width={width} height={height} contentWidth={contentW} contentHeight={fitH} onTap={onTap}>
      <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', width: contentW, height: fitH }}>
        {unit.map((p, i) => <PageImage key={p} source={source} page={p} width={widths[i]} height={fitH} />)}
      </View>
    </ZoomableView>
  );
}

/** Webtoon strips lay out at full width; height comes from the known shape, or the image once it loads. */
function WebtoonPage({ source, page, width, height, onTap }: { source: ComicSource; page: number; width: number; height?: number; onTap: () => void }) {
  const [uri, setUri] = useState<string | null>(null);
  const [ratio, setRatio] = useState(WEBTOON_FALLBACK_RATIO);
  useEffect(() => {
    let live = true;
    source.getPageUri(page).then((u) => { if (live) setUri(u); }).catch(() => undefined);
    return () => { live = false; };
  }, [source, page]);
  return (
    <Pressable onPress={onTap} style={{ width, height: height ?? width * ratio, backgroundColor: color.bg }}>
      {uri ? <Image source={{ uri }} style={styles.fill} contentFit="fill" recyclingKey={uri} onLoad={height ? undefined : (e) => setRatio(e.source.height / e.source.width)} /> : null}
    </Pressable>
  );
}

function Scrubber({ page, total, rtl, onSeek }: { page: number; total: number; rtl: boolean; onSeek: (p: number) => void }) {
  const [trackWidth, setTrackWidth] = useState(1);
  const seek = (x: number) => {
    const f = Math.min(1, Math.max(0, x / trackWidth));
    onSeek(Math.round((rtl ? 1 - f : f) * (total - 1)));
  };
  const fraction = total > 1 ? page / (total - 1) : 1;
  return (
    <View
      style={styles.track}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onResponderGrant={(e) => seek(e.nativeEvent.locationX)}
      onResponderMove={(e) => seek(e.nativeEvent.locationX)}
    >
      <View style={[styles.fillBar, rtl ? { right: 0 } : { left: 0 }, { width: `${fraction * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  fill: { width: '100%', height: '100%' },
  center: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg },
  errorText: { color: color.text, fontFamily: font.body, fontSize: type.body, textAlign: 'center' },
  button: { minHeight: 48, paddingHorizontal: space.xl, borderRadius: radius.md, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: color.text, fontFamily: font.bodySemibold, fontSize: type.caption },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.md, backgroundColor: '#000000cc' },
  back: { color: color.text, fontSize: 34, lineHeight: 36 },
  title: { flex: 1, color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle },
  icon: { color: color.text, fontSize: 24 },
  iconActive: { color: color.collectGold },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md, backgroundColor: '#000000cc' },
  track: { height: 28, justifyContent: 'center', backgroundColor: color.border, borderRadius: radius.pill, overflow: 'hidden' },
  fillBar: { position: 'absolute', top: 0, bottom: 0, backgroundColor: color.accent },
  counter: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.caption, textAlign: 'center' },
  modes: { flexDirection: 'row', gap: space.sm, justifyContent: 'center' },
  mode: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: color.border },
  modeActive: { backgroundColor: color.accent, borderColor: color.accent },
  modeText: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.caption },
  modeTextActive: { color: color.text },
  sheetBackdrop: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', backgroundColor: '#000000aa' },
  sheet: { maxHeight: '60%', backgroundColor: color.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md },
  sheetTitle: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle },
  empty: { color: color.muted, fontFamily: font.body, fontSize: type.body },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, borderBottomWidth: 1, borderBottomColor: color.border },
  rowText: { color: color.text, fontFamily: font.bodyMedium, fontSize: type.body },
  rowRemove: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.caption },
});
