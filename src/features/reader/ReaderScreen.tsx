import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent, type ViewToken } from 'react-native';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import Animated, { FadeInDown, FadeInUp, FadeOutDown, FadeOutUp, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sqlite } from '../../lib/db/client';
import { upsertLibraryEntry } from '../../lib/db/queries/library';
import { ActionSheet, type SheetOption } from './dialogs';
import { PageTextSheet, type PageText } from './PageTextSheet';
import { ReaderDisplaySheet, supportsViewFilters, type Display } from './ReaderDisplaySheet';
import { Thumb, ThumbnailStrip } from './ThumbnailStrip';
import { TransitionPage } from './PageTransition';
import { UnlockGate } from './UnlockGate';
import { ZoomableView, type ZoomHandle } from './ZoomableView';
import { detectPagePanels, guidedAvailable } from '../../lib/reader/guided/detect';
import { contentBox, decodeBase64, FULL_PAGE, type Panel } from '../../lib/reader/guided/panels';
import { isUnlocked } from '../../lib/reader/lock';
import { recognizeText } from '../../lib/mind/capture/ocr';
import { optionalNative } from '../../lib/reader/nativeArchive';
import { ComicOpenError, openComicSource, type ComicSource, type PageSize } from '../../lib/reader/ComicSource';
import { buildUnits, unitIndexOf } from '../../lib/reader/formats/spreads';
import { BACKGROUND_COLORS, resolveReading, type Fit, type Reading } from '../../lib/reader/presets';
import {
  getFolder, getReaderComic, listBookmarks, saveReaderMode, saveReaderProgress, saveReaderSizes, setComicPreset, toggleBookmark,
  type ReaderComic, type ReaderMode,
} from '../../lib/reader/readerLibrary';
import { listPresets, loadReaderSettings, saveReaderSettings, type ReaderSettings } from '../../lib/reader/readerSettings';
import { color, font, radius, space, type } from '../../ui/tokens';

type Sizes = Array<PageSize | null>;

const MODES: Array<[ReaderMode, string]> = [['ltr', 'Left → Right'], ['rtl', 'Manga (RTL)'], ['webtoon', 'Webtoon']];
const DEFAULT_RATIO = 0.66;
const WEBTOON_FALLBACK_RATIO = 1.5;

/** Reads every page's shape once (cheap header reads) and remembers it, so reopening is instant. */
async function loadSizes(comic: ReaderComic, source: ComicSource, isLive: () => boolean): Promise<Sizes | null> {
  if (comic.sizes && comic.sizes.length === source.pageCount) return comic.sizes;
  if (!source.cheapSizes) return null;
  const sizes = await source.scanSizes(isLive);
  if (!isLive()) return null;
  saveReaderSizes(comic.id, sizes);
  return sizes;
}

export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [comic] = useState<ReaderComic | null>(() => (id ? getReaderComic(id) : null));
  const [source, setSource] = useState<ComicSource | null>(null);
  const [sizes, setSizes] = useState<Sizes | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(comic ? null : 'Comic not found.');
  const [settings] = useState<ReaderSettings>(() => loadReaderSettings());
  const [reading] = useState<Reading | null>(() => {
    if (!comic) return null;
    return resolveReading({
      comicMode: comic.mode, comicPresetId: comic.presetId, folderPresetId: comic.folderId ? getFolder(comic.folderId)?.presetId ?? null : null,
      defaultPresetId: loadReaderSettings().defaultPresetId, presets: listPresets(),
    });
  });

  useKeepAwake();

  // A locked comic (or one inside a locked folder) asks for its password first, however it was reached.
  const [unlockTick, setUnlockTick] = useState(0);
  const gate = useMemo(() => {
    if (!comic) return null;
    if (comic.locked && !isUnlocked('comic', comic.id)) return { kind: 'comic' as const, id: comic.id, name: comic.title };
    const folder = comic.folderId ? getFolder(comic.folderId) : null;
    if (folder?.locked && !isUnlocked('folder', folder.id)) return { kind: 'folder' as const, id: folder.id, name: folder.name };
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comic, unlockTick]);
  const gateKey = gate ? `${gate.kind}:${gate.id}` : '';

  // The app is portrait-only elsewhere; the reader may rotate so landscape can show two pages.
  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => undefined);
    return () => { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined); };
  }, []);

  useEffect(() => {
    if (!comic || gateKey) return; // nothing is opened until the password is right
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
  }, [comic, gateKey]);

  if (gate) return <UnlockGate kind={gate.kind} id={gate.id} name={gate.name} onUnlocked={() => setUnlockTick((t) => t + 1)} />;
  if (error) return <View style={styles.center}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => router.back()} style={styles.button}><Text style={styles.buttonText}>Back</Text></Pressable></View>;
  if (!comic || !source || sizes === undefined || !reading) return <View style={styles.center}><ActivityIndicator color={color.accent} /><Text style={styles.errorText}>Preparing pages…</Text></View>;
  return <Reader comic={comic} source={source} sizes={sizes} reading={reading} settings={settings} />;
}

type Position = { page: number; frac: number };

/** GPU colour filters (Android 12+). Sepia and brightness are overlays, so they work everywhere. */
function displayFilter(f: Display['filter']) {
  if (!supportsViewFilters) return undefined;
  if (f === 'gray') return { filter: [{ grayscale: 1 }] };
  if (f === 'invert') return { filter: [{ invert: 1 }] };
  if (f === 'contrast') return { filter: [{ contrast: 1.35 }] };
  return undefined;
}

function Reader({ comic, source, sizes, reading, settings }: { comic: ReaderComic; source: ComicSource; sizes: Sizes | null; reading: Reading; settings: ReaderSettings }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const total = source.pageCount;
  const [mode, setMode] = useState<ReaderMode>(reading.mode);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [guided, setGuided] = useState(false);
  const bg = BACKGROUND_COLORS[reading.background];
  const fit = reading.fit;
  const [overlay, setOverlay] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [pageText, setPageText] = useState<PageText>(null);
  const [display, setDisplay] = useState<Display>({ brightness: settings.brightness, filter: settings.filter, pageAnimation: settings.pageAnimation, trimBorders: settings.trimBorders });
  const [trimBoxes, setTrimBoxes] = useState<Record<number, Panel | null>>({});
  const trimAsked = useRef(new Set<number>());
  const scrollX = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({ onScroll: (e) => { scrollX.value = e.contentOffset.x; } });
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [bookmarks, setBookmarks] = useState<Set<number>>(() => new Set(listBookmarks(comic.id)));
  const startPage = Math.min(comic.progressPage, total - 1);
  const [page, setPage] = useState(startPage);
  const askedRef = useRef(false);
  // Opening a comic marks it as being read in the library; reaching the last page offers the rating survey once.
  useEffect(() => {
    if (!comic.workId) return;
    try { const cur = sqlite.getFirstSync<{ status: string }>('SELECT status FROM user_library WHERE work_id = ?', comic.workId)?.status; if (!cur || cur === 'none') upsertLibraryEntry(comic.workId, { status: 'reading' }); } catch { /* library link is optional */ }
  }, [comic.workId]);
  useEffect(() => {
    if (!comic.workId || askedRef.current || total < 3 || page < total - 1 || startPage >= total - 1) return;
    askedRef.current = true;
    Alert.alert('Finished?', 'Rate it and answer a quick taste survey so recommendations get better.', [{ text: 'Not yet', style: 'cancel' }, { text: 'Rate it', onPress: () => router.push(`/check-in/${comic.workId}`) }]);
  }, [page, total, comic.workId, startPage]);
  const [anchor, setAnchor] = useState<Position>({ page: startPage, frac: comic.progressOffset });
  // Live position (updates every scroll); `anchor` is its last saved mirror, safe to read in render.
  const position = useRef<Position>({ page: startPage, frac: comic.progressOffset });
  const listRef = useRef<FlatList<number[]>>(null);
  const changeDisplay = (patch: Partial<Display>) => { setDisplay((d) => ({ ...d, ...patch })); saveReaderSettings(patch); };

  const rtl = mode === 'rtl'; const webtoon = mode === 'webtoon';
  const landscape = width > height;
  const spread = landscape && !webtoon;
  // Guided view reads one page at a time, panel by panel — not in spreads or webtoon strips.
  const guidedActive = guided && guidedAvailable() && !webtoon && !spread;
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
    if (!settings.incognito) saveReaderProgress(comic.id, position.current.page, webtoon ? position.current.frac : 0);
    setAnchor(position.current);
  }, [comic.id, webtoon, settings.incognito]);

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

  // ---- guided view: which panel of the current page is showing ----
  const zoomRefs = useRef(new Map<number, ZoomHandle>());
  const panelState = useRef<{ page: number; panels: Panel[]; index: number }>({ page: -1, panels: [], index: 0 });
  const landOnLast = useRef(false);
  const registerZoom = useCallback((p: number, handle: ZoomHandle | null) => {
    if (handle) zoomRefs.current.set(p, handle); else zoomRefs.current.delete(p);
  }, []);

  const showPanel = (p: number, panel: Panel) => zoomRefs.current.get(p)?.zoomToPanel(panel === FULL_PAGE ? null : panel);

  /** Next (+1) or previous (-1): a panel inside the page when guided, otherwise a whole page/spread. */
  const advance = useCallback((delta: number) => {
    if (guidedActive) {
      const st = panelState.current;
      // Panels for this page are still being found: swallow the tap rather than skipping a page.
      if (st.page !== position.current.page) return;
      if (st.panels.length) {
        const ni = st.index + delta;
        if (ni >= 0 && ni < st.panels.length) { st.index = ni; showPanel(st.page, st.panels[ni]); return; }
      }
      if (delta < 0) landOnLast.current = true; // going back lands on the previous page's last panel
    }
    step(delta);
  }, [guidedActive, step]);

  useEffect(() => {
    if (!guidedActive) { zoomRefs.current.get(page)?.zoomToPanel(null); return; }
    let live = true;
    const wantLast = landOnLast.current; landOnLast.current = false;
    (async () => {
      const uri = await source.getPageUri(page);
      const panels = await detectPagePanels(comic.id, page, uri, rtl);
      if (!live) return;
      const index = wantLast ? panels.length - 1 : 0;
      panelState.current = { page, panels, index };
      showPanel(page, panels[index]);
    })().catch(() => undefined);
    return () => { live = false; };
  }, [page, guidedActive, source, comic.id, rtl]);

  // ---- trim borders: find each single page's real content box on the phone, a page ahead and behind ----
  useEffect(() => {
    const native = optionalNative();
    if (!display.trimBorders || webtoon || spread || !native?.grayThumbnail) return;
    for (const p of [page - 1, page, page + 1]) {
      if (p < 0 || p >= total || trimAsked.current.has(p)) continue;
      trimAsked.current.add(p);
      (async () => {
        try {
          const thumb = await native.grayThumbnail!(await source.getPageUri(p), 120);
          setTrimBoxes((prev) => ({ ...prev, [p]: contentBox(decodeBase64(thumb.data), thumb.width, thumb.height) }));
        } catch { setTrimBoxes((prev) => ({ ...prev, [p]: null })); }
      })();
    }
  }, [display.trimBorders, page, webtoon, spread, total, source]);

  // ---- text on the page, and sharing it ----
  const readPageText = async () => {
    setPageText({ loading: true, text: null });
    const text = await recognizeText(await source.getPageUri(page));
    setPageText(text === null ? { loading: false, text: null, unavailable: true } : { loading: false, text });
  };

  /** Share the page, or — in guided view — just the panel on screen. */
  const sharePage = async () => {
    try {
      if (!(await Sharing.isAvailableAsync())) { Alert.alert('Sharing isn’t available on this device.'); return; }
      let uri = await source.getPageUri(page);
      const st = panelState.current; const size = sizeList[page];
      if (guidedActive && st.page === page && size) {
        const panel = st.panels[st.index];
        if (panel && panel !== FULL_PAGE) {
          const ref = await ImageManipulator.manipulate(uri).crop({ originX: Math.round(panel.x * size.width), originY: Math.round(panel.y * size.height), width: Math.round(panel.w * size.width), height: Math.round(panel.h * size.height) }).renderAsync();
          uri = (await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 })).uri;
        }
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: comic.title });
    } catch { Alert.alert('Couldn’t share this page', 'Try again.'); }
  };

  const rateThis = () => { if (comic.workId) router.push(`/check-in/${comic.workId}`); };
  const menuOptions: SheetOption[] = [
    ...(comic.workId ? [{ label: 'I’m done — rate this comic…', onPress: rateThis }] : []),
    ...(guidedAvailable() && !webtoon && !spread ? [{ label: guided ? 'Turn off guided view' : 'Guided view (panel by panel)', onPress: () => { setGuided((g) => !g); setOverlay(false); } }] : []),
    { label: 'All pages…', onPress: () => setGalleryOpen(true) },
    { label: 'Bookmarks…', onPress: () => setBookmarksOpen(true) },
    ...MODES.map(([m, label]) => ({ label: `Reading mode: ${label}`, checked: mode === m, onPress: () => changeMode(m) })),
    { label: 'Display, filters and page animation…', onPress: () => setDisplayOpen(true) },
    { label: 'Copy or translate text on this page…', onPress: () => { void readPageText(); } },
    { label: guidedActive ? 'Share this panel…' : 'Share this page…', onPress: () => { void sharePage(); } },
    { label: 'More reader settings…', onPress: () => router.push('/reader/settings') },
  ];

  const onTap = useCallback((x: number) => {
    const edge = width * 0.3;
    const flip = settings.invertTaps ? -1 : 1;
    // Outer thirds turn the page (direction-aware); the centre toggles the overlay.
    if (settings.tapZones && x < edge) advance((rtl ? 1 : -1) * flip);
    else if (settings.tapZones && x > width - edge) advance((rtl ? -1 : 1) * flip);
    else setOverlay((o) => !o);
  }, [width, rtl, advance, settings.tapZones, settings.invertTaps]);

  // Prefetch what's coming (and one back) and tell the source where we are so it never evicts them.
  useEffect(() => {
    source.setFocus(page);
    const ahead = spread ? [2, 3, 4, -1] : webtoon ? [1, 2, 3, -1] : [1, 2, -1];
    for (const d of ahead) {
      const p = page + d;
      if (p >= 0 && p < total) source.getPageUri(p).then((u) => { Image.prefetch(u); if (guidedActive && d === 1) detectPagePanels(comic.id, p, u, rtl); }).catch(() => undefined);
    }
  }, [page, source, total, spread, webtoon, guidedActive, comic.id, rtl]);

  const changeMode = (next: ReaderMode) => { persist(); setMode(next); saveReaderMode(comic.id, next); setComicPreset(comic.id, null); setOverlay(false); };

  const onToggleBookmark = () => {
    const now = toggleBookmark(comic.id, page);
    setBookmarks((prev) => { const n = new Set(prev); if (now) n.add(page); else n.delete(page); return n; });
  };

  const allPages = useMemo(() => { const p = Array.from({ length: total }, (_, i) => i); return rtl ? p.reverse() : p; }, [total, rtl]);
  const listKey = `${mode}-${spread ? 'spread' : 'single'}-${Math.round(width)}`;
  const initial = anchor.page;
  const webtoonStartY = strip.known ? strip.offsets[initial] + anchor.frac * strip.heights[initial] : 0;

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <StatusBar hidden={!overlay} />
      <View style={[styles.fill, displayFilter(display.filter)]}>
      <Animated.FlatList
        key={listKey}
        ref={listRef as never}
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
        onScroll={webtoon ? onScroll : scrollHandler}
        scrollEventThrottle={webtoon ? 32 : 16}
        onScrollEndDrag={persist}
        onMomentumScrollEnd={persist}
        onScrollToIndexFailed={({ index }) => setTimeout(() => listRef.current?.scrollToIndex({ index, animated: false }), 100)}
        renderItem={({ item, index }) => webtoon
          ? <WebtoonPage source={source} page={item[0]} width={width} height={strip.known ? strip.heights[item[0]] : undefined} bg={bg} onTap={() => setOverlay((o) => !o)} />
          : (
            <TransitionPage index={index} width={width} scrollX={scrollX} kind={display.pageAnimation}>
              <PagedUnit register={registerZoom} source={source} unit={item} sizes={sizeList} width={width} height={height} rtl={rtl} fit={fit} bg={bg} crop={display.trimBorders && item.length === 1 ? trimBoxes[item[0]] ?? null : null} onTap={onTap} />
            </TransitionPage>
          )}
      />
      </View>
      {display.filter === 'sepia' ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#C99A5B', mixBlendMode: 'multiply' }]} /> : null}
      {display.brightness < 1 ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: 1 - display.brightness }]} /> : null}
      {overlay ? <>
        <Animated.View entering={FadeInUp.duration(180)} exiting={FadeOutUp.duration(140)} style={[styles.top, { paddingTop: insets.top + space.sm }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹</Text></Pressable>
          <Text numberOfLines={1} style={styles.title}>{comic.title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={bookmarks.has(page) ? 'Remove bookmark' : 'Add bookmark'} onPress={onToggleBookmark} hitSlop={10}>
            <Text style={[styles.icon, bookmarks.has(page) && styles.iconActive]}>{bookmarks.has(page) ? '★' : '☆'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="More" onPress={() => setMenuOpen(true)} hitSlop={10}><Text style={styles.icon}>⋯</Text></Pressable>
        </Animated.View>
        <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(140)} style={[styles.bottom, { paddingBottom: insets.bottom + space.md }]}>
          <ThumbnailStrip key={rtl ? 'r' : 'l'} compact={landscape} source={source} pages={allPages} current={page} bookmarks={bookmarks} onSelect={(p) => goToPage(p, false)} />
          <Scrubber page={page} total={total} rtl={rtl} onSeek={(p) => goToPage(p, false)} />
          <View style={landscape ? styles.footerRow : undefined}>
            <Text style={styles.counter}>{page + 1} / {total}</Text>
          </View>
        </Animated.View>
      </> : null}
      <ActionSheet visible={menuOpen} title={comic.title} options={menuOptions} onClose={() => setMenuOpen(false)} />
      <ReaderDisplaySheet visible={displayOpen} value={display} onChange={changeDisplay} onClose={() => setDisplayOpen(false)} />
      <PageTextSheet value={pageText} onClose={() => setPageText(null)} />
      <Modal visible={galleryOpen} animationType="slide" onRequestClose={() => setGalleryOpen(false)} statusBarTranslucent>
        <View style={[styles.gallery, { paddingTop: insets.top + space.sm }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>All pages</Text>
            <Pressable onPress={() => setGalleryOpen(false)} hitSlop={10}><Text style={styles.icon}>✕</Text></Pressable>
          </View>
          <FlatList
            data={allPages}
            numColumns={Math.max(3, Math.floor(width / 96))}
            key={Math.max(3, Math.floor(width / 96))}
            keyExtractor={(p) => String(p)}
            columnWrapperStyle={styles.galleryRow}
            contentContainerStyle={{ paddingBottom: insets.bottom + space.lg }}
            initialNumToRender={18}
            windowSize={5}
            renderItem={({ item }) => <Thumb source={source} page={item} active={item === page} marked={bookmarks.has(item)} onSelect={(p) => { setGalleryOpen(false); goToPage(p, false); }} w={84} h={126} />}
          />
        </View>
      </Modal>
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

function PageImage({ source, page, width, height, crop }: { source: ComicSource; page: number; width: number; height: number; crop?: Panel | null }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    source.getPageUri(page).then((u) => { if (live) setUri(u); }).catch(() => undefined);
    return () => { live = false; };
  }, [source, page]);
  // Trimmed margins: enlarge the picture about its centre so the art box fills the frame, then slide it back to centre.
  const zoom = crop ? Math.min(1.6, 1 / Math.max(crop.w, crop.h)) : 1;
  const shift = crop ? [{ translateX: (0.5 - (crop.x + crop.w / 2)) * zoom * width }, { translateY: (0.5 - (crop.y + crop.h / 2)) * zoom * height }, { scale: zoom }] : undefined;
  return <View style={{ width, height, overflow: 'hidden' }}>{uri ? <Image source={{ uri }} style={[styles.fill, shift && { transform: shift }]} contentFit="contain" recyclingKey={uri} /> : null}</View>;
}

/** One screen of paged reading: a single page, or two side by side (landscape). Zoom applies to the whole unit. */
function PagedUnit({ register, source, unit, sizes, width, height, rtl, fit, bg, crop, onTap }: { register: (page: number, handle: ZoomHandle | null) => void; source: ComicSource; unit: number[]; sizes: Sizes; width: number; height: number; rtl: boolean; fit: Fit; bg: string; crop: Panel | null; onTap: (x: number) => void }) {
  const known = unit.every((p) => sizes[p]);
  const ratios = unit.map((p) => (sizes[p] ? sizes[p]!.width / sizes[p]!.height : DEFAULT_RATIO));
  const sumRatio = ratios.reduce((a, b) => a + b, 0);
  // Known shapes: size the unit to its exact fit so pan limits follow the picture, not the screen.
  // Fit width: a single page fills the width and may run taller than the screen (it then scrolls).
  const fillWidth = fit === 'width' && known && unit.length === 1;
  const fitH = known ? (fillWidth ? width / sumRatio : Math.min(height, width / sumRatio)) : height;
  const widths = known ? ratios.map((r) => r * fitH) : unit.map(() => width / unit.length);
  const contentW = widths.reduce((a, b) => a + b, 0);
  return (
    <ZoomableView ref={(h) => register(unit[0], h)} width={width} height={height} contentWidth={contentW} contentHeight={fitH} background={bg} onTap={onTap}>
      <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', width: contentW, height: fitH }}>
        {unit.map((p, i) => <PageImage key={p} source={source} page={p} width={widths[i]} height={fitH} crop={crop} />)}
      </View>
    </ZoomableView>
  );
}

/** Webtoon strips lay out at full width; height comes from the known shape, or the image once it loads. */
function WebtoonPage({ source, page, width, height, bg, onTap }: { source: ComicSource; page: number; width: number; height?: number; bg: string; onTap: () => void }) {
  const [uri, setUri] = useState<string | null>(null);
  const [ratio, setRatio] = useState(WEBTOON_FALLBACK_RATIO);
  useEffect(() => {
    let live = true;
    source.getPageUri(page).then((u) => { if (live) setUri(u); }).catch(() => undefined);
    return () => { live = false; };
  }, [source, page]);
  return (
    <Pressable onPress={onTap} style={{ width, height: height ?? width * ratio, backgroundColor: bg }}>
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
  track: { height: 20, justifyContent: 'center', backgroundColor: color.border, borderRadius: radius.pill, overflow: 'hidden' },
  fillBar: { position: 'absolute', top: 0, bottom: 0, backgroundColor: color.accent },
  counter: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.caption, textAlign: 'center' },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modes: { flexDirection: 'row', gap: space.sm, justifyContent: 'center' },
  mode: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: color.border },
  modeActive: { backgroundColor: color.accent, borderColor: color.accent },
  modeText: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.caption },
  modeTextActive: { color: color.text },
  gallery: { flex: 1, backgroundColor: color.bg, paddingHorizontal: space.lg },
  galleryRow: { gap: space.sm, marginBottom: space.sm },
  sheetBackdrop: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', backgroundColor: '#000000aa' },
  sheet: { maxHeight: '60%', backgroundColor: color.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md },
  sheetTitle: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle },
  empty: { color: color.muted, fontFamily: font.body, fontSize: type.body },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, borderBottomWidth: 1, borderBottomColor: color.border },
  rowText: { color: color.text, fontFamily: font.bodyMedium, fontSize: type.body },
  rowRemove: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.caption },
});
