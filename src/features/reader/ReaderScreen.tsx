import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View, type ViewToken } from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ZoomableImage } from './ZoomableImage';
import { ComicOpenError, openComicSource, type ComicSource } from '../../lib/reader/ComicSource';
import { getReaderComic, saveReaderMode, saveReaderProgress, type ReaderComic, type ReaderMode } from '../../lib/reader/readerLibrary';
import { color, font, radius, space, type } from '../../ui/tokens';

const MODES: Array<[ReaderMode, string]> = [['ltr', 'Left → Right'], ['rtl', 'Manga (RTL)'], ['webtoon', 'Webtoon']];

export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [comic] = useState<ReaderComic | null>(() => (id ? getReaderComic(id) : null));
  const [source, setSource] = useState<ComicSource | null>(null);
  const [error, setError] = useState<string | null>(comic ? null : 'Comic not found.');

  useKeepAwake();

  useEffect(() => {
    if (!comic) return;
    let live = true; let opened: ComicSource | null = null;
    openComicSource(comic.path, `read-${comic.id}`)
      .then((s) => { if (!live) { s.close(); return; } opened = s; setSource(s); })
      .catch((e) => { if (live) setError(e instanceof ComicOpenError ? e.message : 'Could not open this comic.'); });
    return () => { live = false; opened?.close(); };
  }, [comic]);

  if (error) return <View style={styles.center}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => router.back()} style={styles.button}><Text style={styles.buttonText}>Back</Text></Pressable></View>;
  if (!comic || !source) return <View style={styles.center}><ActivityIndicator color={color.accent} /></View>;
  return <Reader comic={comic} source={source} />;
}

function Reader({ comic, source }: { comic: ReaderComic; source: ComicSource }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<ReaderMode>(comic.mode);
  const [overlay, setOverlay] = useState(false);
  const [page, setPage] = useState(Math.min(comic.progressPage, source.pageCount - 1));
  const listRef = useRef<FlatList<number>>(null);
  const total = source.pageCount;

  // RTL reverses the data so index 0 sits at the right; visual index ↔ page number is a mirror.
  const toIndex = useCallback((p: number) => (mode === 'rtl' ? total - 1 - p : p), [mode, total]);
  const pages = useMemo(() => Array.from({ length: total }, (_, i) => (mode === 'rtl' ? total - 1 - i : i)), [mode, total]);
  const horizontal = mode !== 'webtoon';

  const goTo = useCallback((p: number, animated = true) => {
    const clamped = Math.max(0, Math.min(total - 1, p));
    listRef.current?.scrollToIndex({ index: toIndex(clamped), animated });
  }, [toIndex, total]);

  // Must stay referentially stable — FlatList rejects a changing onViewableItemsChanged.
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken<number>[] }) => {
    const first = viewableItems.find((v) => v.isViewable && v.item != null);
    if (first && first.item != null) { setPage(first.item); saveReaderProgress(comic.id, first.item); }
  }, [comic.id]);

  const onTap = useCallback((x: number) => {
    const edge = width * 0.3;
    // Tap zones: outer thirds turn the page (direction-aware), the centre toggles the overlay.
    if (x < edge) goTo(page + (mode === 'rtl' ? 1 : -1));
    else if (x > width - edge) goTo(page + (mode === 'rtl' ? -1 : 1));
    else setOverlay((o) => !o);
  }, [width, page, mode, goTo]);

  const changeMode = (next: ReaderMode) => {
    setMode(next); saveReaderMode(comic.id, next); setOverlay(false);
  };

  // Re-anchor on the current page after a mode switch.
  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToIndex({ index: toIndex(page), animated: false }), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <View style={styles.root}>
      <StatusBar hidden={!overlay} />
      <FlatList
        key={mode}
        ref={listRef}
        data={pages}
        keyExtractor={(p) => String(p)}
        horizontal={horizontal}
        pagingEnabled={horizontal}
        initialScrollIndex={toIndex(page)}
        getItemLayout={horizontal ? (_, i) => ({ length: width, offset: width * i, index: i }) : undefined}
        initialNumToRender={2}
        windowSize={5}
        maxToRenderPerBatch={2}
        removeClippedSubviews
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        onScrollToIndexFailed={({ index }) => setTimeout(() => listRef.current?.scrollToIndex({ index, animated: false }), 100)}
        renderItem={({ item }) => horizontal
          ? <PagedPage source={source} index={item} width={width} height={height} onTap={onTap} />
          : <WebtoonPage source={source} index={item} width={width} onTap={() => setOverlay((o) => !o)} />}
      />
      {overlay ? <>
        <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹</Text></Pressable>
          <Text numberOfLines={1} style={styles.title}>{comic.title}</Text>
        </View>
        <View style={[styles.bottom, { paddingBottom: insets.bottom + space.md }]}>
          <Scrubber page={page} total={total} rtl={mode === 'rtl'} onSeek={goTo} />
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
    </View>
  );
}

function PagedPage({ source, index, width, height, onTap }: { source: ComicSource; index: number; width: number; height: number; onTap: (x: number) => void }) {
  const getUri = useCallback(() => source.getPageUri(index), [source, index]);
  return <ZoomableImage getUri={getUri} width={width} height={height} onTap={onTap} />;
}

/** Webtoon strips are laid out at full width; height comes from the image's own aspect ratio. */
function WebtoonPage({ source, index, width, onTap }: { source: ComicSource; index: number; width: number; onTap: () => void }) {
  const [uri, setUri] = useState<string | null>(null);
  const [ratio, setRatio] = useState(1.5);
  useEffect(() => {
    let live = true;
    source.getPageUri(index).then((u) => { if (live) setUri(u); }).catch(() => undefined);
    return () => { live = false; };
  }, [source, index]);
  return (
    <Pressable onPress={onTap} style={{ width, height: width * ratio, backgroundColor: color.bg }}>
      {uri ? <Image source={{ uri }} style={styles.fill} contentFit="fill" recyclingKey={uri} onLoad={(e) => setRatio(e.source.height / e.source.width)} /> : null}
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
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md, backgroundColor: '#000000cc' },
  track: { height: 28, justifyContent: 'center', backgroundColor: color.border, borderRadius: radius.pill, overflow: 'hidden' },
  fillBar: { position: 'absolute', top: 0, bottom: 0, backgroundColor: color.accent },
  counter: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.caption, textAlign: 'center' },
  modes: { flexDirection: 'row', gap: space.sm, justifyContent: 'center' },
  mode: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: color.border },
  modeActive: { backgroundColor: color.accent, borderColor: color.accent },
  modeText: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.caption },
  modeTextActive: { color: color.text },
});
