import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSheetDrag } from '../../ui/sheetDrag';
import type { PageAnimation, ReaderFilter } from '../../lib/reader/readerSettings';
import { color, font, radius, space, type } from '../../ui/tokens';

export type Display = { brightness: number; filter: ReaderFilter; pageAnimation: PageAnimation; trimBorders: boolean };

const FILTERS: Array<[ReaderFilter, string, boolean]> = [['none', 'None', false], ['sepia', 'Sepia', false], ['gray', 'Black & white', true], ['invert', 'Invert', true], ['contrast', 'Sharpen contrast', true]];
const ANIMATIONS: Array<[PageAnimation, string]> = [['slide', 'Slide'], ['fade', 'Fade'], ['flip', 'Page flip']];

/** Android 12+ can filter a whole view on the GPU; older phones get brightness, sepia and everything else. */
export const supportsViewFilters = Platform.OS === 'android' ? Number(Platform.Version) >= 31 : true;

function Chip({ label, active, disabled, onPress }: { label: string; active: boolean; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress} style={[styles.chip, active && styles.chipOn, disabled && { opacity: 0.35 }]}><Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text></Pressable>;
}

function Slider({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const [w, setW] = useState(1);
  const set = (x: number) => onChange(Math.round((min + Math.min(1, Math.max(0, x / w)) * (max - min)) * 100) / 100);
  const frac = (value - min) / (max - min);
  return (
    <View style={styles.track} onLayout={(e) => setW(e.nativeEvent.layout.width)} onStartShouldSetResponder={() => true} onResponderGrant={(e) => set(e.nativeEvent.locationX)} onResponderMove={(e) => set(e.nativeEvent.locationX)}>
      <View style={[styles.fill, { width: `${frac * 100}%` }]} />
      <View style={[styles.knob, { left: `${frac * 100}%` }]} />
    </View>
  );
}

export function ReaderDisplaySheet({ visible, value, onChange, onClose }: { visible: boolean; value: Display; onChange: (patch: Partial<Display>) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const drag = useSheetDrag(onClose);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
<Pressable style={styles.backdrop} onPress={onClose}>
<GestureDetector gesture={drag.gesture}>
<Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }, drag.style]}>
          <View style={styles.handle} />
          <Text style={styles.heading}>Display</Text>

          <Text style={styles.label}>Brightness · {Math.round(value.brightness * 100)}%</Text>
          <Slider value={value.brightness} min={0.2} max={1} onChange={(brightness) => onChange({ brightness })} />

          <Text style={styles.label}>Colour filter</Text>
          <View style={styles.row}>{FILTERS.map(([k, l, needsGpu]) => <Chip key={k} label={l} active={value.filter === k} disabled={needsGpu && !supportsViewFilters} onPress={() => onChange({ filter: k })} />)}</View>
          {!supportsViewFilters ? <Text style={styles.note}>Black & white, invert and contrast need Android 12 or newer.</Text> : null}

          <Text style={styles.label}>Page animation</Text>
          <View style={styles.row}>{ANIMATIONS.map(([k, l]) => <Chip key={k} label={l} active={value.pageAnimation === k} onPress={() => onChange({ pageAnimation: k })} />)}</View>

          <Text style={styles.label}>Borders</Text>
          <View style={styles.row}><Chip label={value.trimBorders ? 'Trimmed' : 'Keep margins'} active={value.trimBorders} onPress={() => onChange({ trimBorders: !value.trimBorders })} /></View>
          <Text style={styles.note}>Trimming cuts the blank margin off single pages so the art fills the screen. Full-bleed pages are left alone.</Text>
        </Animated.View>
</GestureDetector>
      </Pressable>
</GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' },
  sheet: { width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: color.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, gap: space.sm },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: color.border, marginBottom: space.sm },
  heading: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle },
  label: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.caption, marginTop: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  note: { color: color.faint, fontFamily: font.body, fontSize: 12, lineHeight: 17 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: color.border },
  chipOn: { backgroundColor: color.accent, borderColor: color.accent },
  chipText: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.caption },
  chipTextOn: { color: color.text },
  track: { height: 36, justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, height: 6, borderRadius: 3, backgroundColor: color.accent },
  knob: { position: 'absolute', width: 22, height: 22, borderRadius: 11, marginLeft: -11, backgroundColor: color.text },
});
