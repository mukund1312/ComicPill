// A thin ring that fills clockwise with reading progress; finished shows a full ring with a tick. Drawn with Skia (no SVG dependency).
import { StyleSheet, View } from 'react-native';
import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { Icon } from './Icon';
import { useAppearance } from './theme';

export function ProgressRing({ value, done = false, size = 26, stroke = 2.5 }: { value: number; done?: boolean; size?: number; stroke?: number }) {
  const c = useAppearance().theme.colors;
  const r = (size - stroke) / 2;
  const arc = useMemo(() => {
    const p = Skia.Path.Make();
    const v = done ? 1 : Math.max(0, Math.min(1, value));
    if (v > 0) p.addArc({ x: stroke / 2, y: stroke / 2, width: size - stroke, height: size - stroke }, -90, 360 * v);
    return p;
  }, [value, done, size, stroke]);
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2, backgroundColor: `${c.background}CC` }]} accessible accessibilityLabel={done ? 'Finished' : `${Math.round(value * 100)}% read`}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} style="stroke" strokeWidth={stroke} color={`${c.textPrimary}33`} />
        <Path path={arc} style="stroke" strokeWidth={stroke} strokeCap="round" color={c.progress} />
      </Canvas>
      {done ? <Icon name="checkmark" size={size * 0.55} color={c.textPrimary} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { alignItems: 'center', justifyContent: 'center' } });
