import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Fill, Group, Image as SkiaImage, Paint, Shadow, type SkImage } from '@shopify/react-native-skia';
import { Easing, runOnJS, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import type { Rect } from '../../lib/reader/bubbles/pop';

/** A balloon lifted off the page: its cut-out, where it sits on screen now, and where it settles. */
export type FloatTarget = { key: string; image: SkImage; from: Rect; to: Rect };

const OUT_MS = 150;
const IN_MS = 320;
const COMMIT_MS = 140;
const SCRIM = 0.22;
const RESIZE_MS = 220;

type Props = {
  /** The balloon up close, and the ones either side of it in reading order (so a finger can slide between them). */
  target: FloatTarget | null;
  prev: FloatTarget | null;
  next: FloatTarget | null;
  /** −1…+1: how far a finger has slid toward the previous (−) or next (+) balloon. The gesture layer writes it; this layer only reads it. */
  skim: SharedValue<number>;
};

// Shared-value writes live out here so the compiler lint (which cannot tell a shared value from an ordinary object) leaves the component alone.
function put(sv: SharedValue<number>, v: number) { sv.value = v; }
function glide(sv: SharedValue<number>, to: number, ms: number, easing: (t: number) => number, done?: () => void) {
  // The finished-callback runs on the UI thread, so it has to be a worklet (the babel plugin only marks inline ones) and hand off with runOnJS.
  const onFinish = done
    ? (finished?: boolean) => { 'worklet'; if (finished) runOnJS(done)(); }
    : undefined;
  sv.value = withTiming(to, { duration: ms, easing }, onFinish);
}

/** A balloon's identity and where it will rest, so a change of size (not only of balloon) is noticed. */
const sig = (t: FloatTarget | null) => (t ? `${t.key}|${Math.round(t.to.x)}|${Math.round(t.to.y)}|${Math.round(t.to.w)}` : '');

const unique = (list: Array<FloatTarget | null>): FloatTarget[] => {
  const seen = new Set<string>(); const out: FloatTarget[] = [];
  for (const t of list) if (t && !seen.has(t.key)) { seen.add(t.key); out.push(t); }
  return out;
};

/**
 * Draws lifted balloons over the page; the page is only dimmed. The balloon starts exactly on its own original (no seam), then grows about the
 * pivot that carries it onto its resting place while its shadow deepens. The three balloons in play (previous, current, next) are each drawn at a
 * progress worked out from their role: the current one contracts as a finger slides away while the neighbour expands, so sliding through dialogue
 * is one continuous motion. A new current balloon either takes over from a finished slide with no change on screen, or (from a tap on the arrows)
 * the old one settles back first and the new one lifts. Any of it can be interrupted.
 */
export function BubbleFloatLayer({ target, prev, next, skim }: Props) {
  const [items, setItems] = useState<Array<{ id: number; target: FloatTarget }>>([]);
  const p = useSharedValue(0);
  const curId = useSharedValue(-1); const prevId = useSharedValue(-1); const nextId = useSharedValue(-1);
  const ids = useRef(new Map<string, number>()); const counter = useRef(0);
  const idOf = (t: FloatTarget | null) => { if (!t) return -1; let id = ids.current.get(t.key); if (id === undefined) { id = counter.current++; ids.current.set(t.key, id); } return id; };
  const withIds = (list: FloatTarget[]) => list.map((target) => ({ id: idOf(target), target }));
  const latest = useRef({ target, prev, next });
  const currentKey = useRef<string | null>(null);
  useEffect(() => { latest.current = { target, prev, next }; });

  const setRoles = (t: FloatTarget | null, pv: FloatTarget | null, nx: FloatTarget | null) => {
    put(curId, idOf(t)); put(prevId, idOf(pv)); put(nextId, idOf(nx));
  };
  const settleIn = (t: FloatTarget | null, pv: FloatTarget | null, nx: FloatTarget | null) => {
    const l = latest.current;
    if (l.target?.key !== t?.key) return; // the reader has moved on again
    currentKey.current = t?.key ?? null;
    setItems(withIds(unique([t, pv, nx])));
    setRoles(t, pv, nx);
    put(skim, 0);
    if (t) glide(p, 1, IN_MS, Easing.out(Easing.cubic));
  };
  const handOver = (t: FloatTarget | null, pv: FloatTarget | null, nx: FloatTarget | null) => {
    currentKey.current = t?.key ?? null;
    setItems(withIds(unique([t, pv, nx])));
    setRoles(t, pv, nx); // the neighbour was already drawn at full size; it simply becomes the current one
    put(skim, 0);
  };
  const clear = () => { if (latest.current.target) return; setItems([]); setRoles(null, null, null); currentKey.current = null; put(skim, 0); };

  useEffect(() => {
    if (!target) {
      if (currentKey.current === null && items.length === 0) return;
      glide(skim, 0, OUT_MS, Easing.linear);
      glide(p, 0, OUT_MS, Easing.in(Easing.cubic), clear);
      return;
    }
    if (currentKey.current === target.key) {
      // Same balloon; only its neighbours changed (they finished being cut out).
      setItems(withIds(unique([target, prev, next])));
      setRoles(target, prev, next);
      return;
    }
    // A finger slid toward this balloon: the neighbour is already on screen; finish the slide, then make it the current one.
    const wasNeighbour = items.some((i) => i.target.key === target.key);
    if (wasNeighbour && Math.abs(skim.value) > 0.02) {
      const dir = skim.value > 0 ? 1 : -1;
      glide(skim, dir, COMMIT_MS, Easing.out(Easing.quad), () => handOver(latest.current.target, latest.current.prev, latest.current.next));
      return;
    }
    if (currentKey.current !== null && p.value > 0.001) {
      glide(p, 0, OUT_MS, Easing.in(Easing.cubic), () => settleIn(latest.current.target, latest.current.prev, latest.current.next));
    } else {
      settleIn(target, prev, next);
    }
    // The three targets are compared by key inside; listing the objects would restart every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig(target), sig(prev), sig(next)]);

  const scrim = useDerivedValue(() => SCRIM * p.value);
  if (items.length === 0) return null;
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Fill color="black" opacity={scrim} />
      {items.map(({ id, target: t }) => (
        <Lifted key={t.key} id={id} target={t} p={p} skim={skim} curId={curId} prevId={prevId} nextId={nextId} />
      ))}
    </Canvas>
  );
}

function Lifted({ id, target, p, skim, curId, prevId, nextId }: { id: number; target: FloatTarget; p: SharedValue<number>; skim: SharedValue<number>; curId: SharedValue<number>; prevId: SharedValue<number>; nextId: SharedValue<number> }) {
  // Where the balloon rests is itself animated: a size change (A−, A+, the slider) moves it smoothly to the new resting rect instead of snapping.
  const toX = useSharedValue(target.to.x); const toY = useSharedValue(target.to.y); const toW = useSharedValue(target.to.w);
  useEffect(() => {
    glide(toX, target.to.x, RESIZE_MS, Easing.out(Easing.cubic)); glide(toY, target.to.y, RESIZE_MS, Easing.out(Easing.cubic)); glide(toW, target.to.w, RESIZE_MS, Easing.out(Easing.cubic));
  }, [target.to.x, target.to.y, target.to.w, toX, toY, toW]);
  const fx = target.from.x; const fy = target.from.y; const fw = target.from.w;

  // How far up this balloon is, by the part it plays right now.
  const progress = useDerivedValue(() => {
    if (id === curId.value) return p.value * (1 - Math.min(1, Math.abs(skim.value)));
    if (id === nextId.value) return p.value * Math.max(0, skim.value);
    if (id === prevId.value) return p.value * Math.max(0, -skim.value);
    return 0;
  });
  // The scale from the balloon's own place to its resting place, and the one point that stays still while it grows.
  const geo = useDerivedValue(() => {
    const s = toW.value / fw;
    if (Math.abs(s - 1) < 1e-3) return { s, px: fx + fw / 2, py: fy };
    return { s, px: (toX.value - s * fx) / (1 - s), py: (toY.value - s * fy) / (1 - s) };
  });
  const transform = useDerivedValue(() => [{ scale: 1 + (geo.value.s - 1) * progress.value }]);
  const origin = useDerivedValue(() => ({ x: geo.value.px, y: geo.value.py }));
  const opacity = useDerivedValue(() => (progress.value > 0.002 ? 1 : 0));
  const blur = useDerivedValue(() => 2 + 14 * progress.value);
  const dy = useDerivedValue(() => 1 + 10 * progress.value);
  return (
    <Group opacity={opacity} layer={<Paint><Shadow dx={0} dy={dy} blur={blur} color="rgba(0,0,0,0.55)" /></Paint>}>
      <Group transform={transform} origin={origin}>
        <SkiaImage image={target.image} x={target.from.x} y={target.from.y} width={target.from.w} height={target.from.h} fit="fill" />
      </Group>
    </Group>
  );
}
