import { useEffect, useMemo, useState } from 'react';
import { PixelRatio, StyleSheet } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Canvas, Fill, ImageShader, Shader, Skia, type SkImage } from '@shopify/react-native-skia';
import Animated, { useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import type { ComicSource } from '../../../lib/reader/ComicSource';
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
 * A page as a picture for the curl, no bigger than the screen needs. The resize runs natively, off the JavaScript thread, so turning pages quickly
 * never queues up full-size decodes there (which froze the app); only the small copy is decoded. Kept by page and target height.
 */
const small = new Map<string, Promise<string>>();
async function pagePicture(uri: string, targetHeight: number) {
  const key = `${uri}|${targetHeight}`;
  let job = small.get(key);
  if (!job) {
    job = ImageManipulator.manipulate(uri).resize({ height: targetHeight }).renderAsync()
      .then((ref) => ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 }))
      .then((r) => r.uri)
      .catch(() => uri);
    small.set(key, job);
    if (small.size > 24) small.delete(small.keys().next().value as string);
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
  useEffect(() => {
    let live = true;
    const near = new Set<number>();
    for (let u = Math.max(0, current - 1); u <= Math.min(units.length - 1, current + 1); u++) for (const p of units[u]) near.add(p);
    for (const p of near) {
      if (images[p]) continue;
      source.getPageUri(p)
        .then((uri) => pagePicture(uri, Math.round(height * PixelRatio.get())))
        .then((image) => {
          if (!live || !image) return;
          setImages((cur) => {
            const next: Record<number, SkImage> = {};
            for (const k of Object.keys(cur)) if (near.has(Number(k))) next[Number(k)] = cur[Number(k)];
            next[p] = image;
            return next;
          });
        })
        .catch(() => undefined);
    }
    return () => { live = false; };
  // `images` is read only to skip pages already loaded; reloading on its change would loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const uniforms = useDerivedValue(() => {
    const t = progress.value;
    const top = rFrom.right[1]; const pageH = rFrom.right[3] - top;
    // Turning this spread away holds the point that was touched on its right page; turning back holds the page's outer edge.
    const x = grab.from.get() === turning ? (grab.x.get() - S) / Math.max(E - S, 1) : 1;
    const g = spreadGeometry(t, S, E, pageH, { x, y: (grab.y.get() - top) / Math.max(pageH, 1), dy: grab.dy.get(), span: width });
    return { rFromL: rFrom.left, rFromR: rFrom.right, rToL: rTo.left, rToR: rTo.right, size: [width, height], S, E, A0: g.A0, Rn: g.Rn, Rcap: g.Rcap, vG: g.vG, Hb: g.H, t, phi: g.phi, bg: color, paper: paperFor(color), hasNext: lift ? 0 : 1 };
  }, [S, E, width, height, color, rFrom, rTo, grab, turning, lift]);
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

  const uniforms = useDerivedValue(() => {
    const t = progress.value;
    // The sheet is the page itself (fitted inside the screen), not the letterbox around it. It lifts from where the finger took hold
    // (top corner, bottom corner or anywhere between) and the fold follows the finger.
    const pageH = pageR[3] - pageR[1];
    const pageW = pageR[2] - pageR[0];
    // Turning this page away holds the point that was touched; turning back to it holds its outer edge (the finger is on the page before).
    const x = grab.from.get() === turning ? (grab.x.get() - pageR[0]) / Math.max(pageW, 1) : 1;
    const g = curlGeometry(t, pageW, pageH, { x, y: (grab.y.get() - pageR[1]) / Math.max(pageH, 1), dy: grab.dy.get(), span: width });
    return { size: [width, height], A0: g.A0, Rn: g.Rn, Rcap: g.Rcap, vG: g.vG, Hb: g.H, t, bg: color, paper: paperFor(color), phi: g.phi, pageR, hasNext: lift ? 0 : 1 };
  }, [width, height, color, pageR, grab, turning, lift]);

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
