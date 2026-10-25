// One place that turns "a character / creator / style / genre" into a picture.
// Every image is a bundled cover of the entity's signature work, cropped to the
// top (where faces and logos are). If there is no cover, or it fails to load,
// the entity shows its initials — a missing image never blocks a choice.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { ImageSourcePropType } from 'react-native';
import { COVER_ASSETS } from '../../ui/coverAssets';
import { useAppearance } from '../../ui/theme';

export function initialsOf(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function EntityImage({ workId, photo, name, size, shape = 'circle', height }: {
  workId?: string; photo?: ImageSourcePropType; name: string; size: number; shape?: 'circle' | 'card'; height?: number;
}) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const [failed, setFailed] = useState(false);
  const asset = failed ? undefined : photo ?? (workId ? COVER_ASSETS[workId] : undefined);
  const h = shape === 'circle' ? size : height ?? Math.round(size * 1.3);
  const radius = shape === 'circle' ? size / 2 : 14;
  return (
    <View
      accessibilityIgnoresInvertColors
      style={[styles.frame, { width: size, height: h, borderRadius: radius, backgroundColor: c.surfaceRaised, borderColor: c.border }]}
    >
      {asset ? (
        <Image
          source={asset} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top"
          cachePolicy="memory-disk" transition={120} onError={() => setFailed(true)} recyclingKey={workId ?? name}
        />
      ) : (
        <Text style={{ color: c.textSecondary, fontFamily: typography.display, fontSize: Math.max(14, size * 0.32) }}>{initialsOf(name)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ frame: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1 } });
