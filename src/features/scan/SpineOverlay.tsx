import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { useAppearance } from '../../ui/theme';
import type { Box, ScanItem } from '../../lib/scan/session';

const tone = (item: ScanItem, c: { success: string; warning: string; textMuted: string; primary: string }) =>
  item.status === 'excluded' ? c.textMuted : item.status === 'matched' || item.status === 'manually_verified' ? c.success : item.status === 'needs_review' ? c.warning : c.primary;

/**
 * The shelf photo with a numbered box over every detected book. Tapping a box selects that book's result and tapping a result highlights its box.
 * In drawing mode, dragging on the photo draws a box around a book the scan missed.
 */
export function SpineOverlay({ uri, width, height, items, selectedId, onSelect, drawing, onDrawn }: {
  uri: string; width: number; height: number; items: ScanItem[]; selectedId: string | null; onSelect: (scanId: string) => void; drawing: boolean; onDrawn: (box: Box) => void;
}) {
  const { theme } = useAppearance(); const c = theme.colors;
  const [draft, setDraft] = useState<Box | null>(null);
  // The drawing handlers run later, from touch events, so they read what they need from refs kept up to date after each render.
  const size = useRef({ w: 1, h: 1 });
  const live = useRef({ onDrawn });
  useEffect(() => { live.current = { onDrawn }; });
  const origin = useRef<{ x: number; y: number } | null>(null);
  const frac = (v: number, total: number) => Math.min(1, Math.max(0, v / total));
  const drawApi = useMemo(() => ({
    begin: (x: number, y: number) => { origin.current = { x: frac(x, size.current.w), y: frac(y, size.current.h) }; setDraft(null); },
    move: (x: number, y: number) => {
      const o = origin.current; if (!o) return;
      const x1 = frac(x, size.current.w); const y1 = frac(y, size.current.h);
      setDraft({ x: Math.min(o.x, x1), y: Math.min(o.y, y1), w: Math.abs(x1 - o.x), h: Math.abs(y1 - o.y) });
    },
    end: () => { setDraft((d) => { if (d && d.w > 0.012 && d.h > 0.05) live.current.onDrawn(d); return null; }); origin.current = null; },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the handlers read live values through refs; they must stay one stable object for the gesture
  }), []);

  return (
    <View style={[styles.frame, { aspectRatio: width / height, borderColor: drawing ? c.primary : c.border }]} onLayout={(e) => { size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }; }}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Your shelf photo" />
      {items.map((item, i) => {
        const color = tone(item, c); const selected = selectedId === item.scanId;
        return (
          <Pressable key={item.scanId} accessibilityRole="button" accessibilityLabel={`Book ${i + 1}`} disabled={drawing} onPress={() => onSelect(item.scanId)}
            style={[styles.box, { left: `${item.box.x * 100}%`, top: `${item.box.y * 100}%`, width: `${item.box.w * 100}%`, height: `${item.box.h * 100}%`, borderColor: color, borderWidth: selected ? 3 : 1.5, backgroundColor: selected ? `${color}33` : 'transparent', opacity: item.status === 'excluded' ? 0.45 : 1 }]}>
            <View style={[styles.badge, { backgroundColor: color }]}><Text style={styles.badgeText}>{i + 1}</Text></View>
          </Pressable>
        );
      })}
      {drawing ? <DrawLayer api={drawApi} /> : null}
      {draft ? <View pointerEvents="none" style={[styles.box, { left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%`, borderColor: c.primary, borderWidth: 2, borderStyle: 'dashed', backgroundColor: `${c.primary}22` }]} /> : null}
    </View>
  );
}

/** Catches a drag over the photo while drawing a box for a missed book. */
function DrawLayer({ api }: { api: { begin: (x: number, y: number) => void; move: (x: number, y: number) => void; end: () => void } }) {
  const gesture = useMemo(() => Gesture.Pan().runOnJS(true).minDistance(0).onBegin((e) => { api.begin(e.x, e.y); }).onUpdate((e) => { api.move(e.x, e.y); }).onFinalize(() => { api.end(); }), [api]);
  return <GestureDetector gesture={gesture}><View style={StyleSheet.absoluteFill} /></GestureDetector>;
}

const styles = StyleSheet.create({
  frame: { width: '100%', borderRadius: 14, overflow: 'hidden', borderWidth: 1 },
  box: { position: 'absolute', borderRadius: 4 },
  badge: { position: 'absolute', top: -1, left: -1, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
