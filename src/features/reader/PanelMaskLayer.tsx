import { StyleSheet } from 'react-native';
import { Canvas, Path, Skia, FillType } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import type { Panel } from '../../lib/reader/guided/panels';
import type { GuidedMask } from '../../lib/reader/readerSettings';

type Props = {
  style: GuidedMask;
  /** The panel that is up (page fractions), or null while the whole page is showing. */
  panel: Panel | null;
  camera: { scale: SharedValue<number>; tx: SharedValue<number>; ty: SharedValue<number> };
  content: { width: number; height: number };
  view: { width: number; height: number };
  /** The reader's page colour, for the solid style. */
  background: string;
  /** 0…1: how much of the mask is showing (it fades in with the camera and out when the page is whole). */
  amount: SharedValue<number>;
};

/**
 * Hides, or dims, everything outside the panel in view. One path (the whole screen with the panel cut out of it) is redrawn every frame from the
 * live camera, so the hole follows the panel exactly while the camera moves, with no lag and no second picture. The page itself is never touched.
 * An irregular panel's outline is used when there is one; otherwise its box.
 */
export function PanelMaskLayer({ style, panel, camera, content, view, background, amount }: Props) {
  const outline = panel ? (panel.poly && panel.poly.length >= 3 ? panel.poly : ([[panel.x, panel.y], [panel.x + panel.w, panel.y], [panel.x + panel.w, panel.y + panel.h], [panel.x, panel.y + panel.h]] as Array<[number, number]>)) : null;

  const path = useDerivedValue(() => {
    const b = Skia.PathBuilder.Make();
    b.setFillType(FillType.EvenOdd);
    b.addRect({ x: -2, y: -2, width: view.width + 4, height: view.height + 4 });
    if (outline) {
      const sc = camera.scale.value; const tx = camera.tx.value; const ty = camera.ty.value;
      outline.forEach(([x, y], i) => {
        const sx = view.width / 2 + tx + (x - 0.5) * content.width * sc;
        const sy = view.height / 2 + ty + (y - 0.5) * content.height * sc;
        if (i === 0) b.moveTo(sx, sy); else b.lineTo(sx, sy);
      });
      b.close();
    }
    return b.build();
  });
  const opacity = useDerivedValue(() => amount.value * (style === 'solid' ? 1 : 0.68));

  if (style === 'none' || !panel) return null;
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path path={path} color={style === 'solid' ? background : '#000'} opacity={opacity} />
    </Canvas>
  );
}
