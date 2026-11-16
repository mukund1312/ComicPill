import { useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, StyleSheet } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Canvas, Fill, ImageShader, Shader, Skia, type SkImage } from '@shopify/react-native-skia';
import Animated, { useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import type { ComicSource } from '../../../lib/reader/ComicSource';
import { optionalNative } from '../../../lib/reader/nativeArchive';
import { File, Paths } from 'expo-file-system';
import { curlEffect, curlGeometry, paperFor, spreadCurlEffect, spreadGeometry } from './curlShader';
import type { CurlGrab } from './curlDrag';

/** '#rrggbb' → 0..1 channels. Anything else reads as black. */
function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

type Size = { width: number; height: number } | null;
type Props = {
  source: ComicSource;
  /** The reading units (one page each, or two side by side), and the one on screen now. */
  units: number[][];
  current: number;
  /** Each page's pixel size (null if unknown), to place the pages of a spread exactly where the reader draws them. */
  sizes: Size[];
  scrollX: SharedValue<number>;
  width: number;
  height: number;
  bg: string;
  /** Where the finger took hold of the page and how it has moved: the fold starts there and follows it. */
  grab: CurlGrab;
};

type Rect = [number, number, number, number]; // x0, y0, x1, y1

/**
 * A page as a picture for the curl, no bigger than the screen needs. Made off the JavaScript thread: on Android a native decoder reads the page
 * straight at a reduced size (several times faster than a full decode and resize); elsewhere the image manipulator does it. Kept by page and
 * target height, so a page turned back and forth is prepared once.
 */
const small = new Map<string, Promise<string>>();
let made = 0;
function smallCopy(uri: string, targetHeight: number) {
  const native = optionalNative();
  if (native?.downscaleImage) {
    // At least 60% of the screen's height: the curl is on screen only while the page moves, and a half-size decode is about four times cheaper.
    const dest = new File(Paths.cache, `curl-${Date.now()}-${made++}.jpg`);
    return native.downscaleImage(uri, dest.uri, Math.round(targetHeight * 0.6)).then(() => dest.uri);
  }
  return ImageManipulator.manipulate(uri).resize({ height: targetHeight }).renderAsync()
    .then((ref) => ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 }))
    .then((r) => r.uri);
}
async function pagePicture(uri: string, targetHeight: number) {
  const key = `${uri}|${targetHeight}`;
  let job = small.get(key);
  if (!job) {
    job = smallCopy(uri, targetHeight).catch(() => uri);
    small.set(key, job);
    if (small.size > 24) {
      const oldest = small.keys().next().value as string;
      const gone = small.get(oldest); small.delete(oldest);
      // The small copies are ours to tidy (never the page itself, which a failed copy falls back to).
      void gone?.then((u) => { if (u.includes('/curl-')) { const f = new File(u); if (f.exists) f.delete(); } }).catch(() => undefined);
    }
  }
  return Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(await job));
}
const DEFAULT_RATIO = 0.66;

/** A turn within a pixel and a half of either page is no turn: the pager's offset is rounded to whole pixels, so it can rest a hair off. */
function atRest(t: number, width: number) {
  'worklet';
  const px = 1.5 / Math.max(width, 1);
  return t <= px || t >= 1 - px;
}

/** Where the two pages of a spread sit on screen: side by side at one height, the pair fitted to the screen and centred (as the reader lays them out). */
function spreadRects(unit: number[], sizes: Size[], width: number, height: number): { left: Rect; right: Rect } {
  const ratio = (p: number) => (sizes[p] ? sizes[p]!.width / sizes[p]!.height : DEFAULT_RATIO);
  const rl = ratio(unit[0]); const rr = ratio(unit[1]);
  const h = Math.min(height, width / (rl + rr)); const wl = rl * h; const wr = rr * h;
  const x0 = (width - wl - wr) / 2; const y0 = (height - h) / 2;
  return { left: [x0, y0, x0 + wl, y0 + h], right: [x0 + wl, y0, x0 + wl + wr, y0 + h] };
}

/**
 * Draws the 3-D page curl over the pager while a turn is in progress, and nothing otherwise. The turn's progress is just the pager's scroll
 * position, so a finger drag controls it, letting go finishes or cancels it with the pager's own momentum, and a tap's animated scroll plays it.
 * One page turns over the next; on a two-page spread the right page turns over like a book's (see SpreadSheet). Pages are decoded one by one and
 * kept by page number, the ones near the reader's place only.
 */
export function PageCurlLayer({ source, units, current, sizes, scrollX, width, height, bg, grab }: Props) {
  const [images, setImages] = useState<Record<number, SkImage>>({});
  // Pages wanted right now: the turn either way, plus one more ahead (reading forwards is the common case) so a fast run of turns finds its
  // pictures ready. Read through a ref, so a picture that finishes after the reader has moved on is still kept if it is still near.
  const wanted = useRef(new Set<number>());
  const asked = useRef(new Set<number>());
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => {
    const near = new Set<number>(); const order: number[] = [];
    // Nearest first: this turn, the next, the one back, then further ahead.
    for (const u of [current, current + 1, current - 1, current + 2]) {
      if (u < 0 || u >= units.length) continue;
      for (const p of units[u]) if (!near.has(p)) { near.add(p); order.push(p); }
    }
    wanted.current = near;
    for (const p of order) {
      if (asked.current.has(p)) continue;
      asked.current.add(p);
      source.getPageUri(p)
        .then((uri) => pagePicture(uri, Math.round(height * PixelRatio.get())))
        .then((image) => {
          if (!mounted.current || !image) { asked.current.delete(p); return; }
          setImages((cur) => {
            const next: Record<number, SkImage> = {};
            for (const k of Object.keys(cur)) if (wanted.current.has(Number(k))) next[Number(k)] = cur[Number(k)];
            if (wanted.current.has(p)) next[p] = image;
            // Anything dropped can be asked for again later.
            for (const k of asked.current) if (!wanted.current.has(k) && !next[k]) asked.current.delete(k);
            return next;
          });
        })
        .catch(() => { asked.current.delete(p); });
    }
  }, [source, current, units, height]);

  const color = rgb(bg);
  const sheet = (k: number) => {
    const from = units[k];
    // The last page has nothing after it: pulled past the end it lifts against growing resistance over an empty space, then falls back.
    const last = k === units.length - 1;
    const to = last ? from : units[k + 1];
    if (!from || !to) return null;
    const lift = last ? grab.end : undefined;
    if (from.length === 1 && to.length === 1) {
      const a = images[from[0]]; const b = images[to[0]];
      return a && b ? <Sheet key={`s${k}`} from={a} to={b} turning={k} scrollX={scrollX} width={width} height={height} color={color} grab={grab} lift={lift} /> : null;
    }
    if (from.length === 2 && to.length === 2) {
      const imgs = [images[from[0]], images[from[1]], images[to[0]], images[to[1]]];
      if (imgs.some((i) => !i)) return null;
      return <SpreadSheet key={`p${k}`} imgs={imgs as SkImage[]} rFrom={spreadRects(from, sizes, width, height)} rTo={spreadRects(to, sizes, width, height)} turning={k} scrollX={scrollX} width={width} height={height} color={color} grab={grab} lift={lift} />;
    }
    return null; // a lone cover next to a spread just slides
  };

  return <>{sheet(current)}{sheet(current - 1)}</>;
}

/** The right-hand page of a spread turning over like a book's, onto the left half, uncovering the next spread. */
function SpreadSheet({ imgs, rFrom, rTo, turning, scrollX, width, height, color, grab, lift }: { imgs: SkImage[]; rFrom: { left: Rect; right: Rect }; rTo: { left: Rect; right: Rect }; turning: number; scrollX: SharedValue<number>; width: number; height: number; color: [number, number, number]; grab: CurlGrab; lift?: SharedValue<number> }) {
  const S = rFrom.right[0]; const E = rFrom.right[2];
  const progress = useDerivedValue(() => {
    if (lift) return lift.get() > 0.001 ? lift.get() : 0;
    const t = scrollX.value / width - turning;
    return atRest(t, width) ? 0 : t;
  }, [turning, width, lift]);
  // While this sheet isn't turning, its uniforms stay the very same object, so the canvas is not redrawn at all (a full-screen shader per frame,
  // twice over, was most of the cost of turning pages quickly).
  const idle = useMemo(() => ({ rFromL: rFrom.left, rFromR: rFrom.right, rToL: rTo.left, rToR: rTo.right, size: [width, height], S, E, A0: E - S, Rn: 1, Rcap: 0.5, vG: 0, Hb: 1, t: 0, phi: 0, bg: color, paper: paperFor(color), hasNext: lift ? 0 : 1 }), [rFrom, rTo, width, height, S, E, color, lift]);
  const uniforms = useDerivedValue(() => {
    const t = progress.value;
    if (t === 0) return idle;
    const top = rFrom.right[1]; const pageH = rFrom.right[3] - top;
    // Turning this spread away holds the point that was touched on its right page; turning back holds the page's outer edge.
    const back = grab.from.get() !== turning;
    const x = back ? 1 : (grab.x.get() - S) / Math.max(E - S, 1);
    const g = spreadGeometry(t, S, E, pageH, { x, y: (grab.y.get() - top) / Math.max(pageH, 1), dy: grab.dy.get(), span: width, back });
    return { rFromL: rFrom.left, rFromR: rFrom.right, rToL: rTo.left, rToR: rTo.right, size: [width, height], S, E, A0: g.A0, Rn: g.Rn, Rcap: g.Rcap, vG: g.vG, Hb: g.H, t, phi: g.phi, bg: color, paper: paperFor(color), hasNext: lift ? 0 : 1 };
  }, [S, E, width, height, color, rFrom, rTo, grab, turning, lift, idle]);
  const style = useAnimatedStyle(() => ({ opacity: progress.value > 0 ? 1 : 0 }));
  if (!spreadCurlEffect) return null;
  const at = (r: Rect) => ({ x: r[0], y: r[1], width: r[2] - r[0], height: r[3] - r[1] });
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Fill>
          <Shader source={spreadCurlEffect} uniforms={uniforms}>
            <ImageShader image={imgs[0]} fit="fill" rect={at(rFrom.left)} />
            <ImageShader image={imgs[1]} fit="fill" rect={at(rFrom.right)} />
            <ImageShader image={imgs[2]} fit="fill" rect={at(rTo.left)} />
            <ImageShader image={imgs[3]} fit="fill" rect={at(rTo.right)} />
          </Shader>
        </Fill>
      </Canvas>
    </Animated.View>
  );
}

/** One sheet: `from` turns away over `to` while the pager sits between page `turning` and the one after it. */
function Sheet({ from, to, turning, scrollX, width, height, color, grab, lift }: { from: SkImage; to: SkImage; turning: number; scrollX: SharedValue<number>; width: number; height: number; color: [number, number, number]; grab: CurlGrab; lift?: SharedValue<number> }) {
  // Where the page sits on screen (fitted like the reader fits it): the sheet that turns is exactly this rectangle.
  const pageR = useMemo((): [number, number, number, number] => {
    const k = Math.min(width / from.width(), height / from.height());
    const w = from.width() * k; const h = from.height() * k; const x = (width - w) / 2; const y = (height - h) / 2;
    return [x, y, x + w, y + h];
  }, [from, width, height]);
  // Progress of this sheet's turn: 0 while the pager rests on `turning`, 1 once it reaches the next page; otherwise this sheet is idle.
  const progress = useDerivedValue(() => {
    if (lift) return lift.get() > 0.001 ? lift.get() : 0;
    const s = scrollX.value / width - turning;
    return atRest(s, width) ? 0 : s;
  }, [turning, width, lift]);

  // Unchanged uniforms while idle: no redraw (see SpreadSheet).
  const idle = useMemo(() => ({ size: [width, height], A0: pageR[2] - pageR[0], Rn: 1, Rcap: 0.5, vG: 0, Hb: 1, t: 0, bg: color, paper: paperFor(color), phi: 0, pageR, hasNext: lift ? 0 : 1 }), [width, height, color, pageR, lift]);
  const uniforms = useDerivedValue(() => {
    const t = progress.value;
    if (t === 0) return idle;
    // The sheet is the page itself (fitted inside the screen), not the letterbox around it. It lifts from where the finger took hold
    // (top corner, bottom corner or anywhere between) and the fold follows the finger.
    const pageH = pageR[3] - pageR[1];
    const pageW = pageR[2] - pageR[0];
    // Turning this page away holds the point that was touched; turning back to it holds its outer edge (the finger is on the page before).
    const back = grab.from.get() !== turning;
    const x = back ? 1 : (grab.x.get() - pageR[0]) / Math.max(pageW, 1);
    const g = curlGeometry(t, pageW, pageH, { x, y: (grab.y.get() - pageR[1]) / Math.max(pageH, 1), dy: grab.dy.get(), span: width, back });
    return { size: [width, height], A0: g.A0, Rn: g.Rn, Rcap: g.Rcap, vG: g.vG, Hb: g.H, t, bg: color, paper: paperFor(color), phi: g.phi, pageR, hasNext: lift ? 0 : 1 };
  }, [width, height, color, pageR, grab, turning, lift, idle]);

  const style = useAnimatedStyle(() => ({ opacity: progress.value > 0 ? 1 : 0 }));
  if (!curlEffect) return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Fill>
          <Shader source={curlEffect} uniforms={uniforms}>
            <ImageShader image={from} fit="contain" rect={{ x: 0, y: 0, width, height }} />
            <ImageShader image={to} fit="contain" rect={{ x: 0, y: 0, width, height }} />
          </Shader>
        </Fill>
      </Canvas>
    </Animated.View>
  );
}
