// Covers arranged the way a store shelf shows a series: the first issue in front, the next two fanned behind it.
import { StyleSheet, View } from 'react-native';
import { ComicCover } from './comic';

export type StackItem = { title: string; workId?: string };

export function CoverStack({ items, width = 150 }: { items: StackItem[]; width?: number }) {
  const [front, left, right] = items;
  const height = width * 1.5;
  return (
    <View style={{ width: width * 1.9, height: height + 16, alignItems: 'center', justifyContent: 'center' }}>
      {right ? <View style={[styles.layer, { width, transform: [{ translateX: width * 0.42 }, { rotate: '7deg' }, { scale: 0.92 }], opacity: 0.85 }]}><ComicCover size="fluid" title={right.title} workId={right.workId} /></View> : null}
      {left ? <View style={[styles.layer, { width, transform: [{ translateX: -width * 0.42 }, { rotate: '-7deg' }, { scale: 0.92 }], opacity: 0.85 }]}><ComicCover size="fluid" title={left.title} workId={left.workId} /></View> : null}
      {front ? <View style={[styles.layer, { width }]}><ComicCover size="fluid" title={front.title} workId={front.workId} /></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({ layer: { position: 'absolute' } });
