import { memo, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { ComicSource } from '../../lib/reader/ComicSource';
import { radius } from '../../ui/tokens';
import { useThemed, type Palette } from '../../ui/theme';

const GAP = 6;

type Props = { source: ComicSource; pages: number[]; current: number; bookmarks: Set<number>; onSelect: (page: number) => void; compact?: boolean };

export function ThumbnailStrip({ source, pages, current, bookmarks, onSelect, compact = false }: Props) {
  const { styles } = useThemed(makeStyles);
  const THUMB_W = compact ? 30 : 38; const THUMB_H = compact ? 45 : 57;
  const index = Math.max(0, pages.indexOf(current));
  return (
    <FlatList
      horizontal
      data={pages}
      keyExtractor={(p) => String(p)}
      showsHorizontalScrollIndicator={false}
      initialScrollIndex={index}
      getItemLayout={(_, i) => ({ length: THUMB_W + GAP, offset: (THUMB_W + GAP) * i, index: i })}
      initialNumToRender={10}
      windowSize={5}
      style={{ height: THUMB_H + 4 }}
      contentContainerStyle={styles.content}
      renderItem={({ item }) => <Thumb source={source} page={item} active={item === current} marked={bookmarks.has(item)} onSelect={onSelect} w={THUMB_W} h={THUMB_H} />}
    />
  );
}

export const Thumb = memo(function Thumb({ source, page, active, marked, onSelect, w, h }: { source: ComicSource; page: number; active: boolean; marked: boolean; onSelect: (p: number) => void; w: number; h: number }) {
  const { styles } = useThemed(makeStyles);
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    source.getPageUri(page).then((u) => { if (live) setUri(u); }).catch(() => undefined);
    return () => { live = false; };
  }, [source, page]);
  return (
    <Pressable onPress={() => onSelect(page)} style={[styles.thumb, { width: w, height: h }, active && styles.active]}>
      {uri ? <Image transition={180} source={{ uri }} style={styles.image} contentFit="cover" recyclingKey={String(page)} /> : null}
      <Text style={styles.number}>{page + 1}</Text>
      {marked ? <View style={styles.mark} /> : null}
    </Pressable>
  );
});

const makeStyles = (color: Palette) => StyleSheet.create({
  content: { gap: GAP },
  thumb: { borderRadius: radius.sm / 2, overflow: 'hidden', backgroundColor: color.surface2, borderWidth: 2, borderColor: 'transparent' },
  active: { borderColor: color.accent },
  image: { width: '100%', height: '100%' },
  number: { position: 'absolute', bottom: 0, left: 0, right: 0, textAlign: 'center', color: color.text, fontSize: 9, lineHeight: 12, backgroundColor: '#000000aa' },
  mark: { position: 'absolute', top: 0, right: 4, width: 8, height: 14, backgroundColor: color.collectGold },
});
