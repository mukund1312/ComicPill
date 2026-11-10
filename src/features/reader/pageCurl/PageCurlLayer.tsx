import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Fill, ImageShader, Shader, Skia, type SkImage } from '@shopify/react-native-skia';
import Animated, { useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import type { ComicSource } from '../../../lib/reader/ComicSource';
import { curlEffect, curlGeometry } from './curlShader';

/** '#rrggbb' → 0..1 channels. Anything else reads as black. */
function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

type Props = {
  source: ComicSource;
  /** The reading units (one page each, or two side by side), and the one on screen now. */
  units: number[][];
  current: number;
  scrollX: SharedValue<number>;
  width: number;
  height: number;
  bg: string;
};

/** A unit as one picture: a single page as it is, a spread as its pages laid side by side at the same height. */
async function unitImage(source: ComicSource, unit: number[]): Promise<SkImage | null> {
  const decoded: SkImage[] = [];
  for (const p of unit) {
    const data = await Skia.Data.fromURI(await source.getPageUri(p));
    const image = Skia.Image.MakeImageFromEncoded(data);
    if (!image) return null;
    decoded.push(image);
  }
  if (decoded.length === 1) return decoded[0];
  const H = Math.min(2400, Math.max(...decoded.map((d) => d.height())));
  const widths = decoded.map((d) => Math.round((d.width() * H) / d.height()));
  const total = widths.reduce((a, b) => a + b, 0);
  const surface = Skia.Surface.MakeOffscreen(total, H);
  if (!surface) return decoded[0];
  const canvas = surface.getCanvas(); const paint = Skia.Paint();
  let x = 0;
  decoded.forEach((d, i) => { canvas.drawImageRect(d, Skia.XYWHRect(0, 0, d.width(), d.height()), Skia.XYWHRect(x, 0, widths[i], H), paint); x += widths[i]; });
  surface.flush();
  return surface.makeImageSnapshot();
}

/**
 * Draws the 3-D page curl over the pager while a turn is in progress, and nothing otherwise. The turn's progress is just the pager's scroll
 * position, so a finger drag controls it, letting go finishes or cancels it with the pager's own momentum, and a tap's animated scroll plays it.
 * Two sheets are prepared: the current unit turning forward over the next, and the previous unit coming back over the current one. A two-page
 * spread turns as one sheet.
 */
export function PageCurlLayer({ source, units, current, scrollX, width, height, bg }: Props) {
  // Decoded units, keyed by their number (never by position), so the pair a sheet draws cannot shift when the pager changes its current unit
  // part-way through a drag. The neighbours are loaded ahead of time, and units further away are let go.
  const [images, setImages] = useState<Record<number, SkImage>>({});
  useEffect(() => {
    let live = true;
    for (let u = Math.max(0, current - 1); u <= Math.min(units.length - 1, current + 2); u++) {
      if (images[u]) continue;
      unitImage(source, units[u]).then((image) => {
        if (!live || !image) return;
        setImages((cur) => {
          const next: Record<number, SkImage> = {};
          for (const k of Object.keys(cur)) if (Math.abs(Number(k) - current) <= 3) next[Number(k)] = cur[Number(k)];
          next[u] = image;
          return next;
        });
      }).catch(() => undefined);
    }
    return () => { live = false; };
  // `images` is read only to skip units already loaded; reloading on its change would loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, current, units]);

  const color = rgb(bg);
  const sheet = (turning: number) => (images[turning] && images[turning + 1]
    ? <Sheet key={turning} from={images[turning]} to={images[turning + 1]} turning={turning} scrollX={scrollX} width={width} height={height} color={color} />
    : null);

  return <>{sheet(current)}{sheet(current - 1)}</>;
}

/** One sheet: `from` turns away over `to` while the pager sits between page `turning` and the one after it. */
function Sheet({ from, to, turning, scrollX, width, height, color }: { from: SkImage; to: SkImage; turning: number; scrollX: SharedValue<number>; width: number; height: number; color: [number, number, number] }) {
  // Progress of this sheet's turn: 0 while the pager rests on `turning`, 1 once it reaches the next page; otherwise this sheet is idle.
  const progress = useDerivedValue(() => {
    const s = scrollX.value / width - turning;
    return s > 0.002 && s < 0.998 ? s : 0;
  }, [turning, width]);

  const uniforms = useDerivedValue(() => {
    const t = progress.value;
    const { a, R } = curlGeometry(t, width);
    return { size: [width, height], a, R, t, bg: color };
  }, [width, height, color]);

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
