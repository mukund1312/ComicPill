import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, Dimensions, FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent, type ViewToken } from 'react-native';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInDown, FadeInUp, FadeOut, FadeOutDown, FadeOutUp, useAnimatedScrollHandler, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
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
import { TransitionPage, useStackedCells } from './PageTransition';
import { PageCurlLayer } from './pageCurl/PageCurlLayer';
import { BookFlipLayer } from './BookFlipLayer';
import { UnlockGate } from './UnlockGate';
import { ZoomableView, type ZoomHandle } from './ZoomableView';
import { detectPagePanels, guidedAvailable, resetPagePanels, saveEditedPanels } from '../../lib/reader/guided/detect';
import { contentBox, decodeBase64, FULL_PAGE, type Panel } from '../../lib/reader/guided/panels';
import { isUnlocked } from '../../lib/reader/lock';
import { readPageText as readText } from '../../lib/reader/ocr/readPage';
import { panelAt, tapDirection } from '../../lib/reader/guided/camera';
import { PanelMaskLayer } from './PanelMaskLayer';
import { boxFromCorners, bubbleAt, insertInOrder, manualBubble, type Bubble } from '../../lib/reader/bubbles/bubbles';
import { detectPageBubbles, saveCorrectedBubbles } from '../../lib/reader/bubbles/detect';
import { BubbleGestureLayer } from './BubbleGestureLayer';
import { BubbleFloatLayer, type FloatTarget } from './BubbleFloatLayer';
import { extractBubble } from '../../lib/reader/bubbles/extract';
import { BUBBLE_SIZE_STEP, clampBubbleSize, settleRect } from '../../lib/reader/bubbles/pop';
import { feedback } from '../../lib/platform/feedback';
import { makeSerialQueue, nextSide, stepForSide, stepForVolume, stepPosition, type NavMode, type NavPosition, type Step } from '../../lib/reader/navigation/readerNav';
import { useHardwareKeys, type HardwareKey } from './useHardwareKeys';
import { combineUnit, fromUnit, slotAt, slotFor, toUnit, unitPanels, unitSlots, type Origin } from '../../lib/reader/unitLayout';
import { optionalNative } from '../../lib/reader/nativeArchive';
import { CloudFetchError, ensureLocalCopy, freeSpaceFor, isCached, planFetch, readyComics } from '../../lib/reader/cloudCache';
import { budgetMode, cloudBudgetBytes } from '../../lib/reader/cloudBudget';
import { completeLinkedComic, expandLinkedBundle } from '../../lib/reader/importComics';
import { formatBytes } from '../../lib/reader/bytes';
import type { ReadyComic, RoomPlan } from '../../lib/reader/makeRoom';
import { MakeRoomSheet } from './MakeRoomSheet';
import { notice } from '../../ui/dialogs';
import { ComicOpenError, openComicSource, type ComicSource, type PageSize } from '../../lib/reader/ComicSource';
import { buildUnits, unitIndexOf } from '../../lib/reader/formats/spreads';
import { BACKGROUND_COLORS, BUILTIN_PRESETS, resolveReading, type Fit, type Reading } from '../../lib/reader/presets';
import {
  getFolder, getReaderComic, listBookmarks, saveReaderMode, saveReaderProgress, saveReaderSizes, setComicPreset, setPageCount, toggleBookmark,
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
  const [arrived, setArrived] = useState<{ bytes: number; total: number | null } | null>(null);
  const [room, setRoom] = useState<{ plan: RoomPlan; ready: ReadyComic[]; resolve: (ids: string[] | null) => void } | null>(null);
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
    // Back on a phone the rest of the app is portrait again; a tablet keeps rotating.
    return () => { const { width: w, height: h } = Dimensions.get('window'); if (Math.min(w, h) < 600) ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined); };
  }, []);

  useEffect(() => {
    if (!comic || gateKey) return; // nothing is opened until the password is right
    let live = true; let opened: ComicSource | null = null;
    (async () => {
      try {
        // A comic that isn't downloaded yet must fit in the space the reader set aside; if it doesn't, something is put away first.
        if (comic.sourceUri && !isCached(comic.id)) {
          const plan = planFetch(comic);
          if (plan.over > 0 || plan.overCount > 0) {
            // Over the number of comics kept at once: the reader always chooses which one goes, even in automatic mode.
            if (budgetMode() === 'auto' && plan.overCount === 0) plan.suggested.forEach(freeSpaceFor);
            else {
              const putAway = await new Promise<string[] | null>((resolve) => setRoom({ plan, ready: readyComics(comic.id), resolve }));
              setRoom(null);
              if (!putAway) { if (live) router.back(); return; }
              putAway.forEach(freeSpaceFor);
            }
          }
        }
        const localPath = await ensureLocalCopy(comic, (p) => { if (live) setArrived(p); }); // a cloud link is fetched here the first time
        const s = await openComicSource(localPath, `read-${comic.id}`);
        if (!live) { s.close(); return; }
        opened = s; setSource(s);
        // A linked comic that has no cover or page count yet gets them now that it is open.
        if (comic.sourceUri && (comic.pageCount === 0 || !comic.coverPath)) void completeLinkedComic(comic, s).catch(() => undefined);
        const result = await loadSizes(comic, s, () => live);
        if (live) setSizes(result);
      } catch (e) {
        // A linked zip that is really several comics: they are linked in its place.
        if (e instanceof ComicOpenError && e.code === 'no-pages' && comic.sourceUri) {
          const held = await expandLinkedBundle(comic).catch(() => 0);
          if (held > 0) { notice('This zip held several comics', `${held} comics were added to your shelf in its place.`); if (live) router.back(); return; }
        }
        if (live) setError(e instanceof ComicOpenError || e instanceof CloudFetchError ? e.message : 'Could not open this comic.');
      }
    })();
    return () => { live = false; opened?.close(); };
  }, [comic, gateKey]);

  if (gate) return <UnlockGate kind={gate.kind} id={gate.id} name={gate.name} onUnlocked={() => setUnlockTick((t) => t + 1)} />;
  if (error) return <View style={styles.center}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => router.back()} style={styles.button}><Text style={styles.buttonText}>Back</Text></Pressable></View>;
  if (room && comic) return <View style={styles.center}><MakeRoomSheet title={comic.title} need={comic.sizeBytes ?? 0} recompute={() => planFetch(comic)} plan={room.plan} ready={room.ready} onConfirm={(ids) => room.resolve(ids)} onCancel={() => room.resolve(null)} /></View>;
  if (!comic || !source || sizes === undefined || !reading) {
    const fetching = !!comic?.sourceUri && !isCached(comic.id);
    const total = arrived?.total ?? comic?.sizeBytes ?? null;
    return (
      <View style={styles.center}>
        <ActivityIndicator color={color.accent} />
        <Text style={styles.errorText}>{fetching ? 'Fetching from your cloud app…' : 'Preparing pages…'}</Text>
        {fetching && arrived && arrived.bytes > 0 && total ? <Text style={styles.fetchSub}>{formatBytes(arrived.bytes)} of {formatBytes(total)}</Text> : null}
        {fetching && (!arrived || arrived.bytes === 0) ? <Text style={styles.fetchSub}>{comic?.sizeBytes ? `${formatBytes(comic.sizeBytes)}. ` : ''}Your cloud app downloads it first, which can take a while on a slow connection.</Text> : null}
        {fetching ? <Pressable onPress={() => router.back()} style={styles.button}><Text style={styles.buttonText}>Cancel</Text></Pressable> : null}
      </View>
    );
  }
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

const NO_BUBBLES: Record<number, Bubble[]> = {};

/**
 * A button on the floating bar. It uses the gesture system, like the page does: the page's own handlers see every touch inside the screen and, when
 * one activates, cancel ordinary buttons that sit over it, so a plain Pressable here would never fire.
 */
function BarButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  const tap = useMemo(() => Gesture.Tap().runOnJS(true).maxDuration(600).onEnd((_e, ok) => { if (ok) onPress(); }), [onPress]);
  return (
    <GestureDetector gesture={tap}>
      <View accessible accessibilityRole="button" accessibilityLabel={label} style={styles.barButton}>{children}</View>
    </GestureDetector>
  );
}

/** Shared-value writes live outside the component so the compiler lint (which cannot tell a shared value from a plain object) leaves it alone. */
function fadeTo(sv: SharedValue<number>, to: number, ms: number) { sv.value = withTiming(to, { duration: ms }); }

/**
 * Previous and Next for the floating bars. Next sits on the side the reading goes towards, with its arrow pointing that way (right for left-to-right,
 * left for manga); `which` picks the left-hand or right-hand one so a bar can put its count between them.
 */
function StepButton({ which, noun, rtl, onStep, before }: { which: 'left' | 'right'; noun: string; rtl: boolean; onStep: (d: Step) => void; before?: () => void }) {
  const forwardOnRight = nextSide(rtl ? 'rtl' : 'ltr') === 'right';
  const forward = (which === 'right') === forwardOnRight;
  return (
    <BarButton label={`${forward ? 'Next' : 'Previous'} ${noun}`} onPress={() => { before?.(); onStep(forward ? 1 : -1); }}>
      <Text style={styles.bubbleBtn}>{which === 'right' ? '›' : '‹'}</Text>
    </BarButton>
  );
}

function Reader({ comic, source, sizes, reading, settings }: { comic: ReaderComic; source: ComicSource; sizes: Sizes | null; reading: Reading; settings: ReaderSettings }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const total = source.pageCount;
  const [mode, setMode] = useState<ReaderMode>(reading.mode);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [guided, setGuided] = useState(false);
  const [bubbleMode, setBubbleMode] = useState(settings.bubbleZoom);
  const bg = BACKGROUND_COLORS[reading.background];
  const fit = reading.fit;
  const [overlay, setOverlay] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [pageText, setPageText] = useState<PageText>(null);
  const [display, setDisplay] = useState<Display>({ brightness: settings.brightness, filter: settings.filter, pageAnimation: settings.pageAnimation, trimBorders: settings.trimBorders, guidedMask: settings.guidedMask, landscapeLayout: settings.landscapeLayout, bubbleSize: settings.bubbleSize, bubbleSfx: settings.bubbleSfx, guidedMs: settings.guidedMs, bridgeMs: settings.bridgeMs, doubleTapPanel: settings.doubleTapPanel });
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
  // Turned sideways the reader shows two pages side by side like an open book, or one page, as the reader prefers. Guided reading and balloon zoom work
  // on either: on a spread they treat the two pages as one picture.
  const spread = landscape && !webtoon && display.landscapeLayout === 'spread';
  const guidedActive = guided && guidedAvailable() && !webtoon;
  // Bubble zoom: not while panels or trimmed margins already steer the view.
  const bubbleActive = bubbleMode && !webtoon && !guidedActive && !display.trimBorders;
  const sizeList: Sizes = useMemo(() => sizes ?? Array.from({ length: total }, () => null), [sizes, total]);

  const units = useMemo(() => buildUnits(sizeList, spread), [sizeList, spread]);
  // The page (or two pages) on screen now, and where each sits across it.
  const unitPages = useMemo(() => units[unitIndexOf(units, page)] ?? [page], [units, page]);
  const slots = useMemo(() => unitSlots(unitPages, sizeList, rtl), [unitPages, sizeList, rtl]);
  // The real curl is built for one page; on a two-page spread "Page curl" turns as the open-book flip, which is verified there.
  // On a two-page spread, Page flip and Page curl both turn as an open book, drawn by BookFlipLayer over the pager; the pages themselves just slide.
  // Page curl on a left-to-right spread is the real curl (PageCurlLayer turns the right page over like a book); Page flip, or a manga spread, is the hinged sheet.
  const bookActive = spread && !webtoon && (display.pageAnimation === 'flip' || (display.pageAnimation === 'curl' && rtl));
  const turnKind = bookActive ? 'slide' : display.pageAnimation;
  // The 3-D curl needs whole single pages sitting on the page-sized frame, left to right.
  const curlActive = display.pageAnimation === 'curl' && !webtoon && !rtl && !guidedActive && fit === 'contain';
  const stackedCells = useStackedCells(units.length, turnKind === 'flip');
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
    if (p !== position.current.page) feedback.select(); // a page turned
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
  // `panels` are in the unit's coordinates; `per` holds each page's own list and `meta` says which page and place each came from.
  type PanelState = { page: number; panels: Panel[]; index: number; per?: Record<number, Panel[]>; meta?: Origin[] };
  const panelState = useRef<PanelState>({ page: -1, panels: [], index: 0 });
  const landOnLast = useRef(false);
  const resumePanel = useRef<{ page: number; index: number } | null>(null);
  const lastBubble = useRef<{ page: number; x: number; y: number } | null>(null);
  const registerZoom = useCallback((p: number, handle: ZoomHandle | null) => {
    if (handle) zoomRefs.current.set(p, handle); else zoomRefs.current.delete(p);
  }, []);

  // Camera settings are read through a ref so changing one never restarts the panel that is up.
  const guideCfg = useRef(display);
  useEffect(() => { guideCfg.current = display; });
  const maskAmount = useSharedValue(0);
  const [mask, setMask] = useState<{ panel: Panel | null; view: { camera: ZoomHandle['camera']; content: ZoomHandle['content']; view: ZoomHandle['view'] } | null }>({ panel: null, view: null });
  const [panelInfo, setPanelInfo] = useState({ page: -1, index: 0, count: 0 });
  const [barVisible, setBarVisible] = useState(true);
  const barTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Show the guided controls, and hide them again after a few quiet seconds. */
  const showBar = useCallback(() => {
    setBarVisible(true);
    if (barTimer.current) clearTimeout(barTimer.current);
    barTimer.current = setTimeout(() => setBarVisible(false), 3200);
  }, []);
  useEffect(() => () => { if (barTimer.current) clearTimeout(barTimer.current); }, []);

  // Page-to-panel bridge: the page whose first (or, going back, last) panel the camera is about to enter, so taps wait and the pause is honoured.
  const bridgeTo = useRef<number | null>(null);
  const pendingFocus = useRef<{ page: number; x: number; y: number } | null>(null);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const later = useCallback((fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); }, []);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  /** Move the camera to a panel (or back to the whole page) and bring the mask with it. */
  const showPanel = useCallback((p: number, panel: Panel, index = 0, count = 1) => {
    const handle = zoomRefs.current.get(p);
    if (!handle) return;
    const ms = guideCfg.current.guidedMs;
    const whole = panel === FULL_PAGE;
    handle.zoomToPanel(whole ? null : panel, ms, guideCfg.current.guidedMask === 'none');
    setPanelInfo({ page: p, index, count });
    if (whole) fadeTo(maskAmount, 0, ms);
    else { setMask({ panel, view: { camera: handle.camera, content: handle.content, view: handle.view } }); fadeTo(maskAmount, 1, ms); }
  }, [maskAmount]);

  /** Next (+1) or previous (-1): a panel inside the page when guided, otherwise a whole page/spread. */
  const advance = useCallback((delta: number) => {
    if (guidedActive) {
      if (bridgeTo.current !== null) return; // the camera is already on its way to another page
      const st = panelState.current;
      // Panels for this page are still being found: swallow the tap rather than skipping a page.
      if (st.page !== position.current.page) return;
      const ni = st.index + delta;
      if (ni >= 0 && ni < st.panels.length) { st.index = ni; showPanel(st.page, st.panels[ni], ni, st.panels.length); return; }
      // Past the last (or before the first) panel: pull the camera back to the whole page, turn to the neighbouring page, hold on it, then go in.
      const at = position.current.page; const ui = unitIndexOf(units, at);
      if (delta > 0 ? ui >= units.length - 1 : ui <= 0) { feedback.warning(); return; } // the end of the comic: stay on this panel
      bridgeTo.current = units[ui + (delta > 0 ? 1 : -1)][0];
      if (delta < 0) landOnLast.current = true;
      zoomRefs.current.get(at)?.zoomToPanel(null, guideCfg.current.guidedMs);
      fadeTo(maskAmount, 0, guideCfg.current.guidedMs);
      later(() => step(delta), guideCfg.current.guidedMs + 40);
      return;
    }
    step(delta);
  }, [guidedActive, step, units, later, maskAmount, showPanel]);

  useEffect(() => {
    if (!guidedActive) {
      // Leaving panel mode: remember which panel, so coming back to this page picks up there instead of the first.
      if (panelState.current.page >= 0) resumePanel.current = { page: panelState.current.page, index: panelState.current.index };
      bridgeTo.current = null; panelState.current = { page: -1, panels: [], index: 0 }; zoomRefs.current.get(page)?.zoomToPanel(null); fadeTo(maskAmount, 0, 200); return; }
    let live = true;
    const wantLast = landOnLast.current; landOnLast.current = false;
    const bridged = bridgeTo.current === page;
    if (!bridged) bridgeTo.current = null;
    (async () => {
      // Each page of the unit is read on its own, then they are laid side by side as one set of panels.
      const per: Record<number, Panel[]> = {};
      for (const p of unitPages) per[p] = await detectPagePanels(comic.id, p, await source.getPageUri(p), rtl);
      if (!live) return;
      const { items: panels, meta } = unitPanels(unitPages, slots, per);
      // A double-tap on a panel starts here, on that panel; otherwise the first (or, coming back, the last).
      const focus = pendingFocus.current?.page === page ? pendingFocus.current : null; pendingFocus.current = null;
      let index = wantLast ? panels.length - 1 : 0;
      // Turning the phone re-runs this on the same page: stay on the panel being read rather than going back to the first.
      if (!wantLast && !focus && panelState.current.page === page && panelState.current.panels.length) index = Math.min(panelState.current.index, panels.length - 1);
      else if (!wantLast && !focus && resumePanel.current?.page === page) index = Math.min(resumePanel.current.index, panels.length - 1);
      if (focus) { const hit = panelAt(panels, focus.x, focus.y); if (hit >= 0) index = hit; }
      panelState.current = { page, panels, index, per, meta };
      const go = () => { if (!live) return; showPanel(page, panels[index], index, panels.length); showBar(); bridgeTo.current = null; };
      // Arriving from the previous page the whole page is shown first, so the reader sees the layout before the camera goes in.
      if (bridged && guideCfg.current.bridgeMs > 0) later(go, guideCfg.current.bridgeMs); else go();
    })().catch(() => { bridgeTo.current = null; });
    return () => { live = false; };
  // The size is a dependency so turning the phone puts the camera back on the panel under the new layout.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, guidedActive, source, comic.id, rtl, width, height, unitPages, slots]);

  // Double-tap: on the whole page it focuses the panel under the finger; while a panel is up it goes back to the whole page.
  // Kept current through a ref: onDoubleTap is defined before the page-turn helpers below.
  const edgeTurn = useRef<(x: number) => boolean>(() => false);
  const onDoubleTap = useCallback((x: number, y: number) => {
    // Two quick taps on a page edge are two page turns, not a request for panel-by-panel reading.
    if (edgeTurn.current(x)) return;
    if (guidedActive) { setGuided(false); return; }
    const pt = zoomRefs.current.get(page)?.pointToContent(x, y);
    if (pt) pendingFocus.current = { page, x: pt.x, y: pt.y };
    setGuided(true); setOverlay(false);
  }, [guidedActive, page]);

  // ---- panels by hand, for pages the detector cannot read (splash pages, borderless or overlapping panels) ----
  const [panelDrawing, setPanelDrawing] = useState(false);
  const noSkim = useSharedValue(0);
  /** Drag a box around a panel: it joins that page's panels in reading order, is kept for good, and the camera goes to it. */
  const onPanelDraw = useCallback((x0: number, y0: number, x1: number, y1: number) => {
    setPanelDrawing(false);
    const handle = zoomRefs.current.get(page); const st = panelState.current;
    if (!handle || st.page !== page || !st.per) return;
    const a = handle.pointToContent(x0, y0); const b = handle.pointToContent(x1, y1);
    const drawn = boxFromCorners(a.x, a.y, b.x, b.y);
    if (!drawn) return;
    // It belongs to the page it is mostly on, and is kept in that page's own coordinates.
    const slot = slotAt(slots, drawn.x + drawn.w / 2);
    const box = boxFromCorners(...(() => { const l = fromUnit(slot, drawn); return [l.x, l.y, l.x + l.w, l.y + l.h] as [number, number, number, number]; })());
    if (!box) return;
    // The "whole page" placeholder is not a real panel: the first drawn panel replaces it.
    const mine = st.per[slot.page] ?? [];
    const existing = mine.length === 1 && mine[0] === FULL_PAGE ? [] : mine;
    const { list, index: at } = insertInOrder(existing, box, rtl);
    saveEditedPanels(comic.id, slot.page, rtl, list);
    const per = { ...st.per, [slot.page]: list };
    const { items: panels, meta } = unitPanels(unitPages, slots, per);
    const index = Math.max(0, meta.findIndex((m) => m.page === slot.page && m.local === at));
    panelState.current = { page, panels, index, per, meta };
    showPanel(page, panels[index], index, panels.length);
    showBar();
  }, [page, rtl, comic.id, showPanel, showBar, slots, unitPages]);
  /** Throw away the panel that is up (a wrong detection). The last one on a page going leaves that whole page. */
  const removePanel = useCallback(() => {
    const st = panelState.current;
    if (st.page !== page || !st.per || !st.meta || st.panels.length === 0) return;
    const origin = st.meta[st.index]; const mine = st.per[origin.page] ?? [];
    if (!origin || mine.length === 0 || mine[0] === FULL_PAGE) return;
    const list = mine.filter((_, i) => i !== origin.local);
    const next = list.length ? list : [FULL_PAGE];
    saveEditedPanels(comic.id, origin.page, rtl, next);
    const per = { ...st.per, [origin.page]: next };
    const { items: panels, meta } = unitPanels(unitPages, slots, per);
    const index = Math.min(st.index, panels.length - 1);
    panelState.current = { page, panels, index, per, meta };
    showPanel(page, panels[index], index, panels.length);
  }, [page, rtl, comic.id, showPanel, slots, unitPages]);
  /** Forget every edit on this page (or both pages of the spread) and read them again. */
  const redetectPanels = useCallback(() => {
    for (const p of unitPages) resetPagePanels(comic.id, p);
    panelState.current = { page: -1, panels: [], index: 0 };
    zoomRefs.current.get(page)?.zoomToPanel(null, 200);
    fadeTo(maskAmount, 0, 200);
    (async () => {
      const per: Record<number, Panel[]> = {};
      for (const p of unitPages) per[p] = await detectPagePanels(comic.id, p, await source.getPageUri(p), rtl);
      const { items: panels, meta } = unitPanels(unitPages, slots, per);
      panelState.current = { page, panels, index: 0, per, meta };
      showPanel(page, panels[0], 0, panels.length);
    })().catch(() => undefined);
  }, [comic.id, page, rtl, source, showPanel, maskAmount, slots, unitPages]);

  // The Android back button is the Escape key: it leaves guided reading before it leaves the comic.
  useEffect(() => {
    if (!guidedActive) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (panelDrawing) setPanelDrawing(false); else setGuided(false); return true; });
    return () => sub.remove();
  }, [guidedActive, panelDrawing]);

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
    const text = await readText(await source.getPageUri(page), { rtl: reading.mode === 'rtl' });
    setPageText(text === null ? { loading: false, text: null, unavailable: true } : { loading: false, text });
  };

  /** Share the page, or — in guided view — just the panel on screen. */
  const sharePage = async () => {
    try {
      if (!(await Sharing.isAvailableAsync())) { Alert.alert('Sharing isn’t available on this device.'); return; }
      let uri = await source.getPageUri(page);
      const st = panelState.current;
      // On a spread, the panel on screen belongs to one of its pages.
      const origin = st.meta?.[st.index]; const sharePageNo = origin?.page ?? page; const size = sizeList[sharePageNo];
      if (guidedActive && st.page === page && size) {
        uri = await source.getPageUri(sharePageNo);
        const unitPanel = st.panels[st.index];
        const panel = unitPanel && origin ? (unitPanel === FULL_PAGE ? FULL_PAGE : fromUnit(slotFor(slots, sharePageNo), unitPanel)) : unitPanel;
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
    ...(guidedAvailable() && !webtoon ? [{ label: guided ? 'Turn off guided view' : 'Guided view (panel by panel)', onPress: () => { if (!guided && lastBubble.current?.page === page && !pendingFocus.current) pendingFocus.current = { ...lastBubble.current }; lastBubble.current = null; setGuided((g) => !g); setOverlay(false); } }] : []),
    ...(guidedActive ? [
      { label: 'Add a panel by hand…', onPress: () => { zoomRefs.current.get(page)?.zoomToPanel(null, 250); fadeTo(maskAmount, 0, 250); setPanelDrawing(true); setMenuOpen(false); } },
      { label: 'Remove this panel', onPress: removePanel },
      { label: 'Redo panel detection on this page', onPress: redetectPanels },
    ] : []),
    ...(!webtoon && !guidedActive ? [{ label: bubbleMode ? 'Turn off bubble zoom' : 'Bubble zoom (tap a speech balloon)', onPress: () => toggleBubbleMode() }] : []),
    ...(landscape && !webtoon ? [{ label: display.landscapeLayout === 'spread' ? 'Landscape: show one page' : 'Landscape: show two pages (open book)', onPress: () => changeDisplay({ landscapeLayout: display.landscapeLayout === 'spread' ? 'single' : 'spread' }) }] : []),
    { label: 'All pages…', onPress: () => setGalleryOpen(true) },
    { label: 'Bookmarks…', onPress: () => setBookmarksOpen(true) },
    ...MODES.map(([m, label]) => ({ label: `Reading mode: ${label}`, checked: mode === m, onPress: () => changeMode(m) })),
    { label: 'Display, filters and page animation…', onPress: () => setDisplayOpen(true) },
    { label: 'Copy or translate text on this page…', onPress: () => { void readPageText(); } },
    { label: guidedActive ? 'Share this panel…' : 'Share this page…', onPress: () => { void sharePage(); } },
    { label: 'More reader settings…', onPress: () => router.push('/reader/settings') },
  ];

  // ---- bubble zoom: balloons on the page (or both pages of the spread), and which one is up close (-1 none, -2 a hand-picked spot) ----
  // Balloons are found and saved per page; here they are laid side by side into the unit's coordinates so taps and the lift work across a spread.
  const [bubbles, setBubbles] = useState<{ page: number; per: Record<number, Bubble[]>; done: boolean }>({ page: -1, per: NO_BUBBLES, done: false });
  // Sound effects are found with the balloons but only offered when the reader has asked for them.
  const sfxOn = display.bubbleSfx;
  const perHere = useMemo(() => {
    const per = bubbles.page === page ? bubbles.per : NO_BUBBLES;
    if (sfxOn) return per;
    const out: Record<number, Bubble[]> = {};
    for (const k of Object.keys(per)) out[Number(k)] = per[Number(k)].filter((b) => !b.sfx);
    return out;
  }, [bubbles, page, sfxOn]);
  const unitBubbles = useMemo(() => combineUnit(unitPages, slots, perHere), [unitPages, slots, perHere]);
  const here = { list: unitBubbles.items, done: bubbles.page === page && bubbles.done };
  // Focus belongs to the unit it was made on, so turning the page drops it without any resetting.
  // It also belongs to the screen size it was made at: turning the phone drops it, since its place on screen is no longer where it was.
  const sizeKey = `${Math.round(width)}x${Math.round(height)}`;
  const [focusAt, setFocusAt] = useState({ page: -1, i: -1, size: '' });
  const focus = focusAt.page === page && focusAt.size === sizeKey ? focusAt.i : -1;
  const setFocus = useCallback((i: number) => setFocusAt({ page, i, size: sizeKey }), [page, sizeKey]);
  const focusRef = useRef(-1);
  const bubblesRef = useRef<{ page: number; per: Record<number, Bubble[]>; done: boolean; list: Bubble[]; meta: Origin[] }>({ page: -1, per: NO_BUBBLES, done: false, list: [], meta: [] });
  useEffect(() => { focusRef.current = focus; bubblesRef.current = { page: bubbles.page, per: bubbles.per, done: bubbles.done, list: unitBubbles.items, meta: unitBubbles.meta }; });
  useEffect(() => {
    if (!bubbleActive) return;
    let live = true;
    let idle: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const per: Record<number, Bubble[]> = {};
      for (const p of unitPages) per[p] = await detectPageBubbles(comic.id, p, await source.getPageUri(p), rtl);
      if (live) setBubbles({ page, per, done: true });
      // Quietly read the next page(s) too, so they are ready by the time they are turned to — but only once the reader has settled here for a while
      // and has no balloon up close, so the reading never competes with a zoom or a swipe.
      const nextUnit = units[unitIndexOf(units, page) + 1];
      if (live && nextUnit) {
        idle = setTimeout(() => {
          if (!live || focusRef.current !== -1) return;
          for (const p of nextUnit) source.getPageUri(p).then((u) => detectPageBubbles(comic.id, p, u, rtl)).catch(() => undefined);
        }, 6000);
      }
    })().catch(() => { if (live) setBubbles({ page, per: {}, done: true }); });
    return () => { live = false; if (idle) clearTimeout(idle); };
  }, [page, bubbleActive, source, comic.id, rtl, unitPages, units]);

  // A hand-picked balloon (focus -2) lives here, in the unit's coordinates; detected ones live in the lists.
  const [manualBox, setManualBox] = useState<Bubble | null>(null);
  const focusBubble = useCallback((i: number, manual?: Bubble) => {
    const target = manual ?? bubblesRef.current.list[i];
    if (!target) return;
    feedback.select(); // a balloon lifts
    setManualBox(manual ?? null);
    setFocus(manual ? -2 : i);
  }, [setFocus]);
  const leaveBubble = useCallback(() => { setFocus(-1); }, [setFocus]);
  /** Next/previous balloon; stepping off either end returns to the whole page. */
  const stepBubble = useCallback((delta: number) => {
    const list = bubblesRef.current.list; const ni = focusRef.current + delta;
    if (ni < 0 || ni >= list.length) { leaveBubble(); return; }
    focusBubble(ni);
  }, [focusBubble, leaveBubble]);
  // The lifted balloon, and the ones either side of it: each is cut out of its page (once) and placed where it sits on screen now.
  // `skim` is the finger's slide between them, written by the gesture layer.
  const skim = useSharedValue(0);
  // The size preference is read when a balloon is lifted; changing it re-lifts the ones in play (the float layer glides to the new size).
  const bubbleSize = display.bubbleSize;
  const sizeRef = useRef(bubbleSize);
  useEffect(() => { sizeRef.current = bubbleSize; });
  const nudgeBubbleSize = useCallback((delta: number) => changeDisplay({ bubbleSize: clampBubbleSize(sizeRef.current + delta) }), []);
  const [floats, setFloats] = useState<{ cur: FloatTarget | null; prev: FloatTarget | null; next: FloatTarget | null }>({ cur: null, prev: null, next: null });
  type LiftItem = { page: number; local: Bubble };
  const itemAt = useCallback((i: number): LiftItem | null => {
    const m = unitBubbles.meta[i]; const local = m ? perHere[m.page]?.[m.local] : undefined;
    return m && local ? { page: m.page, local } : null;
  }, [unitBubbles, perHere]);
  const manualItem = useMemo<LiftItem | null>(() => {
    if (!manualBox) return null;
    const slot = slotAt(slots, manualBox.x + manualBox.w / 2);
    return { page: slot.page, local: fromUnit(slot, manualBox) };
  }, [manualBox, slots]);
  const activeItem = useMemo(() => (focus >= 0 ? itemAt(focus) : focus === -2 ? manualItem : null), [focus, itemAt, manualItem]);
  // Where the last balloon was, so switching to panel-by-panel on this page starts on the panel that holds it.
  useEffect(() => {
    if (!activeItem) return;
    const box = toUnit(slotFor(slots, activeItem.page), activeItem.local);
    lastBubble.current = { page, x: box.x + box.w / 2, y: box.y + box.h / 2 };
  }, [activeItem, slots, page]);
  const prevItem = useMemo(() => (focus > 0 ? itemAt(focus - 1) : null), [focus, itemAt]);
  const nextItem = useMemo(() => (focus >= 0 ? itemAt(focus + 1) : null), [focus, itemAt]);
  useEffect(() => {
    if (!bubbleActive || !activeItem) return;
    let live = true;
    (async () => {
      const handle = zoomRefs.current.get(page);
      if (!handle) return;
      const lift = async (item: LiftItem | null): Promise<FloatTarget | null> => {
        if (!item) return null;
        const cut = await extractBubble(await source.getPageUri(item.page), item.local);
        if (!cut) return null;
        // The cut-out's place on its own page → on the unit → on the screen.
        const c = toUnit(slotFor(slots, item.page), cut.crop);
        const a = handle.contentToScreen(c.x, c.y); const b = handle.contentToScreen(c.x + c.w, c.y + c.h);
        const from = { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
        return { key: `${item.page}:${item.local.x.toFixed(4)}:${item.local.y.toFixed(4)}`, image: cut.image, from, to: settleRect(from, { width, height }, { size: sizeRef.current }) };
      };
      // The one the reader asked for first, so it never waits on its neighbours.
      const cur = await lift(activeItem);
      if (!live) return;
      setFloats({ cur, prev: null, next: null });
      const [pv, nx] = await Promise.all([lift(prevItem), lift(nextItem)]);
      if (live) setFloats({ cur, prev: pv, next: nx });
    })().catch(() => { if (live) setFloats({ cur: null, prev: null, next: null }); });
    return () => { live = false; };
  }, [activeItem, prevItem, nextItem, bubbleActive, page, source, width, height, bubbleSize, slots]);
  const [drawing, setDrawing] = useState(false);
  /** Drag a box around a balloon by hand: it joins that page's balloons in reading order, and is kept. */
  const onBubbleDraw = useCallback((x0: number, y0: number, x1: number, y1: number) => {
    const handle = zoomRefs.current.get(page);
    setDrawing(false);
    if (!handle) return;
    const a = handle.pointToContent(x0, y0); const b = handle.pointToContent(x1, y1);
    const drawn = boxFromCorners(a.x, a.y, b.x, b.y);
    if (!drawn) return;
    // It belongs to the page it is mostly on, and is kept in that page's own coordinates.
    const slot = slotAt(slots, drawn.x + drawn.w / 2); const l = fromUnit(slot, drawn);
    const box = boxFromCorners(l.x, l.y, l.x + l.w, l.y + l.h);
    if (!box) return;
    const cur = bubblesRef.current.page === page ? bubblesRef.current.per : NO_BUBBLES;
    const { list, index: at } = insertInOrder(cur[slot.page] ?? [], box, rtl);
    saveCorrectedBubbles(comic.id, slot.page, rtl, list);
    const per = { ...cur, [slot.page]: list };
    setBubbles({ page, per, done: true });
    setManualBox(null);
    const { meta } = combineUnit(unitPages, slots, per);
    setFocusAt({ page, i: Math.max(0, meta.findIndex((m) => m.page === slot.page && m.local === at)), size: sizeKey });
  }, [page, rtl, comic.id, setDrawing, slots, unitPages, sizeKey]);
  /** Drop the balloon that is up close (a false detection) and remember that. */
  const removeBubble = useCallback(() => {
    const i = focusRef.current; const { meta, per } = bubblesRef.current; const m = meta[i];
    if (!m) return;
    const next = (per[m.page] ?? []).filter((_, n) => n !== m.local);
    saveCorrectedBubbles(comic.id, m.page, rtl, next);
    setBubbles({ page, per: { ...per, [m.page]: next }, done: true });
    setFocusAt({ page, i: -1, size: sizeKey });
  }, [page, rtl, comic.id, sizeKey]);
  const toggleBubbleMode = () => { const on = !bubbleMode; setBubbleMode(on); setDrawing(false); saveReaderSettings({ bubbleZoom: on }); setOverlay(false); if (!on) setFocus(-1); };

  /** A tap while bubble zoom is on. True when it was used (a balloon picked, or zoomed back out). */
  const bubbleTap = useCallback((x: number, y: number): boolean => {
    const handle = zoomRefs.current.get(page);
    if (!handle || bubblesRef.current.page !== page) return false;
    const pt = handle.pointToContent(x, y);
    const list = bubblesRef.current.list;
    const hit = bubbleAt(list, pt.x, pt.y);
    if (focusRef.current !== -1) { if (hit >= 0 && hit !== focusRef.current) focusBubble(hit); else leaveBubble(); return true; }
    if (hit >= 0) { focusBubble(hit); return true; }
    // Nothing found here: let the reader pick a spot by hand (middle of the screen only; the edges still turn the page).
    if (bubblesRef.current.done && list.length === 0 && x > width * 0.3 && x < width * 0.7 && pt.x >= 0 && pt.x <= 1 && pt.y >= 0 && pt.y <= 1) {
      focusBubble(-2, manualBubble(pt.x, pt.y, (handle.content.width / handle.content.height) * (handle.view.height / handle.view.width)));
      return true;
    }
    return false;
  }, [page, focusBubble, leaveBubble, width]);

  // ---- one navigation controller ----
  // Next and Previous mean the same thing whichever way they are asked for (button, tap, swipe, arrow key, volume key) and whichever mode is on:
  // the next/previous balloon, panel or page, in reading order. The reading direction only decides which physical side stands for Next.
  const navMode: NavMode = guidedActive ? 'panel' : bubbleActive ? 'bubble' : 'page';
  const dirName = rtl ? 'rtl' : 'ltr';
  const pendingBubble = useRef<{ page: number; index: number } | null>(null);
  const queue = useMemo(() => makeSerialQueue(3), []);

  /** Balloons on one reading unit (a page, or both pages of a spread), in order, as the reader will see them. */
  const bubblesOfUnit = useCallback(async (u: number): Promise<Bubble[]> => {
    const pages = units[u]; if (!pages) return [];
    const per: Record<number, Bubble[]> = {};
    for (const p of pages) per[p] = (await detectPageBubbles(comic.id, p, await source.getPageUri(p), rtl)).filter((b) => display.bubbleSfx || !b.sfx);
    return combineUnit(pages, unitSlots(pages, sizeList, rtl), per).items;
  }, [units, comic.id, source, rtl, sizeList, display.bubbleSfx]);

  const navigateBubble = useCallback(async (delta: Step) => {
    const u = unitIndexOf(units, position.current.page);
    const list = bubblesRef.current.page === page ? bubblesRef.current.list : await bubblesOfUnit(u);
    // Nothing lifted yet: Next lifts the first balloon here, Previous the last (a page with none just moves on).
    if (focusRef.current === -1 && list.length > 0) { focusBubble(delta > 0 ? 0 : list.length - 1); return; }
    const at: NavPosition = { page: u, index: Math.max(0, focusRef.current) };
    const result = await stepPosition(at, delta, 'bubble', units.length, async (k) => (await bubblesOfUnit(k)).length);
    if (result.kind === 'edge') { feedback.warning(); return; } // the first or last balloon of the comic: stay put
    if (!result.crossedPage) { focusBubble(result.position.index); return; }
    // Onto another page: turn to it, and lift the first (or last) balloon once that page's balloons are known.
    pendingBubble.current = { page: units[result.position.page][0], index: result.position.index };
    leaveBubble();
    goToPage(units[result.position.page][0]);
  }, [units, page, bubblesOfUnit, focusBubble, leaveBubble, goToPage]);

  // Arrived on the page a crossing was heading for: lift the balloon it meant.
  useEffect(() => {
    const want = pendingBubble.current;
    if (!want || want.page !== page || !bubbleActive || !here.done) return;
    pendingBubble.current = null;
    if (here.list.length > 0) focusBubble(Math.min(want.index, here.list.length - 1));
  }, [page, bubbleActive, here.done, here.list.length, focusBubble]);

  /** The one entry point: Next (+1) or Previous (−1) in the current mode. */
  const navigate = useCallback((delta: Step) => {
    queue(async () => {
      // Balloons tick as they lift and pages as they turn; a panel step inside the page gets its own light tap.
      if (navMode === 'panel') feedback.tap();
      if (navMode === 'bubble') await navigateBubble(delta);
      else advance(delta); // page: a page or spread; panel: the next panel, or across the page boundary with the camera pull-back
    });
  }, [queue, navMode, navigateBubble, advance]);

  // Hardware: volume Up is always Next, Down always Previous; a keyboard's arrows follow the reading direction.
  useHardwareKeys(!webtoon, useCallback((key: HardwareKey) => {
    if (key === 'volume_up' || key === 'volume_down') navigate(stepForVolume(key === 'volume_up' ? 'up' : 'down'));
    else navigate(stepForSide(key, dirName));
  }, [navigate, dirName]));

  useEffect(() => {
    edgeTurn.current = (x: number) => {
      if (!settings.tapZones || guidedActive) return false;
      const edge = width * 0.3; const flip = settings.invertTaps ? -1 : 1;
      const dir = x < edge ? stepForSide('left', dirName) * flip : x > width - edge ? stepForSide('right', dirName) * flip : 0;
      if (!dir) return false;
      navigate(dir as Step); later(() => navigate(dir as Step), 380);
      return true;
    };
  });
  const onTap = useCallback((x: number, y: number) => {
    // A tap on the floating bar belongs to its buttons, not to the page under it.
    if ((bubbleActive || (guidedActive && barVisible)) && y > height - insets.bottom - 96 && Math.abs(x - width / 2) < 260) return;
    if (bubbleActive && bubbleTap(x, y)) return;
    // Panel by panel: the left 30% steps back and the right 70% forward (mirrored for manga); any tap also brings the controls back.
    if (guidedActive) { showBar(); if (settings.tapZones) navigate(tapDirection(x, width, rtl, settings.invertTaps)); return; }
    const edge = width * 0.3;
    const flip = settings.invertTaps ? -1 : 1;
    // Outer thirds turn the page (direction-aware); the centre toggles the overlay.
    if (settings.tapZones && x < edge) navigate((stepForSide('left', dirName) * flip) as Step);
    else if (settings.tapZones && x > width - edge) navigate((stepForSide('right', dirName) * flip) as Step);
    else setOverlay((o) => !o);
  }, [width, height, insets.bottom, rtl, dirName, navigate, settings.tapZones, settings.invertTaps, bubbleActive, bubbleTap, guidedActive, showBar, barVisible]);

  // Prefetch what's coming (and one back) and tell the source where we are so it never evicts them.
  useEffect(() => {
    source.setFocus(page);
    const ahead = spread ? [2, 3, 4, -1] : webtoon ? [1, 2, 3, -1] : [1, 2, -1];
    for (const d of ahead) {
      const p = page + d;
      if (p >= 0 && p < total) source.getPageUri(p).then((u) => { Image.prefetch(u); if (guidedActive && d === 1) detectPagePanels(comic.id, p, u, rtl); }).catch(() => undefined);
    }
  }, [page, source, total, spread, webtoon, guidedActive, comic.id, rtl]);

  const changeMode = (next: ReaderMode) => {
    persist(); setMode(next); saveReaderMode(comic.id, next);
    // A folder's preset would otherwise win on the next open and undo this choice, so when it disagrees the comic pins the matching built-in preset.
    const folderPreset = comic.folderId ? getFolder(comic.folderId)?.presetId ?? null : null;
    const folderMode = folderPreset ? listPresets().find((p) => p.id === folderPreset)?.mode : undefined;
    setComicPreset(comic.id, folderMode && folderMode !== next ? BUILTIN_PRESETS.find((p) => p.mode === next)?.id ?? null : null);
    setOverlay(false);
  };

  const onToggleBookmark = () => {
    const now = toggleBookmark(comic.id, page);
    if (now) feedback.success(); else feedback.tap();
    setBookmarks((prev) => { const n = new Set(prev); if (now) n.add(page); else n.delete(page); return n; });
  };

  // Next belongs on the side the reading goes towards, with its arrow pointing that way: right for left-to-right, left for manga.
  const dirTag = rtl ? '← RTL' : 'LTR →';
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
        CellRendererComponent={webtoon ? undefined : stackedCells as never}
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
        // The turning effects move a page on screen with an animation while its layout position stays put, so the list must not detach "offscreen" pages.
        removeClippedSubviews={display.pageAnimation === 'slide' || webtoon}
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
            <TransitionPage index={index} width={width} scrollX={scrollX} kind={turnKind}>
              <PagedUnit register={registerZoom} source={source} unit={item} sizes={sizeList} width={width} height={height} rtl={rtl} fit={fit} bg={bg} crop={display.trimBorders && item.length === 1 ? trimBoxes[item[0]] ?? null : null} onTap={onTap} onDoubleTap={display.doubleTapPanel && guidedAvailable() && !webtoon && !bubbleActive ? onDoubleTap : undefined} onPullDown={() => router.back()} />
            </TransitionPage>
          )}
      />
      {guidedActive && mask.view && mask.panel ? <PanelMaskLayer style={display.guidedMask} panel={mask.panel === FULL_PAGE ? null : mask.panel} camera={mask.view.camera} content={mask.view.content} view={mask.view.view} background={bg} amount={maskAmount} /> : null}
      {bookActive ? <BookFlipLayer data={data} current={visualIndex(page)} scrollX={scrollX} width={width} height={height} bg={bg} render={(u) => <PagedUnit passive register={registerZoom} source={source} unit={u} sizes={sizeList} width={width} height={height} rtl={rtl} fit={fit} bg={bg} crop={null} onTap={onTap} />} /> : null}
      {curlActive ? <PageCurlLayer source={source} units={units} current={unitIndexOf(units, page)} sizes={sizeList} scrollX={scrollX} width={width} height={height} bg={bg} /> : null}
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
      {bubbleActive ? <BubbleFloatLayer target={activeItem ? floats.cur : null} prev={activeItem ? floats.prev : null} next={activeItem ? floats.next : null} skim={skim} /> : null}
      {guidedActive && barVisible && !overlay ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(220)} pointerEvents="box-none" style={[styles.bubbleBar, { bottom: insets.bottom + space.lg }]}>
          <View style={styles.bubblePill}>
            <StepButton which="left" noun="panel" rtl={rtl} onStep={navigate} before={showBar} />
            <Text style={styles.bubbleCount}>{`${dirTag} Page ${page + 1} · ${panelInfo.page === page ? `${panelInfo.index + 1}/${panelInfo.count}` : '…'}`}</Text>
            <StepButton which="right" noun="panel" rtl={rtl} onStep={navigate} before={showBar} />
            <Pressable accessibilityRole="button" accessibilityLabel={`Other panels: ${display.guidedMask === 'dim' ? 'dimmed' : display.guidedMask === 'solid' ? 'hidden' : 'shown'}. Tap to change`} onPress={() => { showBar(); changeDisplay({ guidedMask: display.guidedMask === 'dim' ? 'solid' : display.guidedMask === 'solid' ? 'none' : 'dim' }); }} hitSlop={10}>
              <Text style={styles.bubbleBtn}>{display.guidedMask === 'dim' ? '◐' : display.guidedMask === 'solid' ? '●' : '○'}</Text>
            </Pressable>
            <BarButton label="More" onPress={() => setMenuOpen(true)}><Text style={styles.bubbleBtn}>⋯</Text></BarButton>
            <BarButton label="Leave guided reading" onPress={() => setGuided(false)}><Text style={styles.bubbleBtn}>✕</Text></BarButton>
          </View>
        </Animated.View>
      ) : null}
      {guidedActive && panelDrawing ? <BubbleGestureLayer mode="draw" width={width} rtl={rtl} skim={noSkim} onTap={() => setPanelDrawing(false)} onDoubleTap={() => setPanelDrawing(false)} onCommit={() => undefined} onDraw={onPanelDraw} /> : null}
      {guidedActive && panelDrawing ? <View pointerEvents="none" style={[styles.bubbleBar, { bottom: insets.bottom + space.lg }]}><View style={styles.bubblePill}><Text style={styles.bubbleCount}>Drag a box around a panel</Text></View></View> : null}
      {bubbleActive && (focus !== -1 || drawing) ? (
        <BubbleGestureLayer mode={drawing ? 'draw' : 'focus'} width={width} rtl={rtl} skim={skim} onTap={bubbleTap} onDoubleTap={leaveBubble} onCommit={navigate} onDraw={onBubbleDraw} />
      ) : null}
      {/* Out of the way while the page controls are up (it would sit on the scrubber). */}
      {bubbleActive && !overlay ? (
        <View pointerEvents="box-none" style={[styles.bubbleBar, { bottom: insets.bottom + space.lg }]}>
          <View style={styles.bubblePill}>
            {drawing ? (
              <Text style={styles.bubbleCount}>Drag a box around a balloon</Text>
            ) : focus >= 0 || focus === -2 ? (
              <>
                {focus >= 0 ? <StepButton which="left" noun="balloon" rtl={rtl} onStep={navigate} /> : null}
                <Text style={styles.bubbleCount}>{focus >= 0 ? `${dirTag} ${focus + 1} / ${here.list.length}` : 'Balloon'}</Text>
                {focus >= 0 ? <StepButton which="right" noun="balloon" rtl={rtl} onStep={navigate} /> : null}
                <BarButton label="Smaller balloon" onPress={() => nudgeBubbleSize(-BUBBLE_SIZE_STEP)}><Text style={[styles.bubbleBtn, styles.bubbleSizeBtn]}>A−</Text></BarButton>
                <BarButton label="Larger balloon" onPress={() => nudgeBubbleSize(BUBBLE_SIZE_STEP)}><Text style={[styles.bubbleBtn, styles.bubbleSizeBtn]}>A+</Text></BarButton>
                <BarButton label="Back to the page" onPress={leaveBubble}><Text style={styles.bubbleBtn}>⤡</Text></BarButton>
                {focus >= 0 ? <BarButton label="Remove this balloon" onPress={removeBubble}><Text style={styles.bubbleBtn}>⌫</Text></BarButton> : null}
              </>
            ) : (
              <Text style={styles.bubbleCount}>{!here.done ? 'Finding balloons…' : here.list.length ? 'Tap a balloon' : 'Tap the page to zoom in'}</Text>
            )}
            <BarButton label={drawing ? 'Cancel selecting' : 'Select a balloon by hand'} onPress={() => setDrawing((d) => !d)}><Text style={[styles.bubbleBtn, drawing && styles.iconActive]}>{drawing ? '✓' : '＋'}</Text></BarButton>
            <BarButton label="Turn off bubble zoom" onPress={toggleBubbleMode}><Text style={styles.bubbleBtn}>✕</Text></BarButton>
          </View>
        </View>
      ) : null}
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
function PagedUnit({ register, source, unit, sizes, width, height, rtl, fit, bg, crop, onTap, onDoubleTap, onPullDown, passive }: { register: (page: number, handle: ZoomHandle | null) => void; source: ComicSource; unit: number[]; sizes: Sizes; width: number; height: number; rtl: boolean; fit: Fit; bg: string; crop: Panel | null; onTap: (x: number, y: number) => void; onDoubleTap?: (x: number, y: number) => void; onPullDown?: () => void; passive?: boolean }) {
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
    <ZoomableView ref={passive ? undefined : (h) => register(unit[0], h)} passive={passive} width={width} height={height} contentWidth={contentW} contentHeight={fitH} background={bg} onTap={onTap} onDoubleTap={onDoubleTap} onPullDown={onPullDown}>
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
  bubbleBar: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  // Wraps to a second line rather than running off a narrow screen.
  bubblePill: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '94%', rowGap: space.xs, alignItems: 'center', gap: space.lg, paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.lg, backgroundColor: '#000000cc' },
  bubbleBtn: { color: '#fff', fontSize: 24, lineHeight: 28 },
  barButton: { paddingHorizontal: 6, paddingVertical: 4 },
  bubbleSizeBtn: { fontSize: 17, fontFamily: font.bodyMedium },
  bubbleCount: { color: '#fff', fontSize: 14 },
  root: { flex: 1, backgroundColor: color.bg },
  fill: { width: '100%', height: '100%' },
  center: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg },
  errorText: { color: color.text, fontFamily: font.body, fontSize: type.body, textAlign: 'center' },
  fetchSub: { color: color.muted, fontFamily: font.body, fontSize: type.caption, textAlign: 'center', maxWidth: 320 },
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
