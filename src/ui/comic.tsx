import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PressableScale } from './PressableScale';
import { Image } from 'expo-image';
import { color, font, radius, space, type } from './tokens';
import { PurchaseBadge } from './primitives';
import { COVER_ASSETS } from './coverAssets';
import { customCoverFor, fileCoverFor } from './fileCovers';
import { pickCover } from '../lib/covers/pick';
import { useAppearance } from './theme';

const coverColors = ['#5b1015', '#421619', '#182b35', '#302042', '#5b351b', '#172b26', '#402121'];
function tint(title: string) { return coverColors[title.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0) % coverColors.length]; }

/** The image behind a work's cover (bundled artwork, or the first page of an imported file), if there is one. */
export function coverSourceFor(workId?: string): { uri: string } | number | undefined {
  if (!workId) return undefined;
  return pickCover(customCoverFor(workId), COVER_ASSETS[workId] as number | { uri: string } | undefined, fileCoverFor(workId));
}

/** A fixed 2:3 cover cell. `workId` looks up a real, bundled cover asset
 * (see scripts/fetch-covers.py + src/ui/coverAssets.ts) — when one exists it
 * renders via expo-image (memory-disk cache, per docs/PERFORMANCE.md);
 * otherwise the tinted placeholder below is the graceful fallback, not an
 * error state, since plenty of works (mocks, unmatched titles) never get one.
 * `recyclingKey` lets FlashList safely recycle the underlying image request. */
export function ComicCover({ title, workId, size = 'grid', status, onPress, recyclingKey }: { title: string; workId?: string; size?: 'tiny' | 'list' | 'grid' | 'hero' | 'fluid'; status?: string; onPress?: () => void; recyclingKey?: string }) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  // This fixed 2:3 size leaves room for three equal library columns on
  // compact phones without asking FlashList to measure every cover.
  const dims = { tiny: [44, 66], list: [58, 86], grid: [96, 144], hero: [132, 198], fluid: [0, 0] }[size];
  const corner = size === 'tiny' ? 6 : size === 'list' ? 9 : 14;
  const shape = size === 'fluid' ? { width: '100%' as const, aspectRatio: 2 / 3 } : { width: dims[0], height: dims[1] };
  const asset = workId ? pickCover(customCoverFor(workId), COVER_ASSETS[workId], fileCoverFor(workId)) : undefined;
  return <PressableScale to={0.97} testID={recyclingKey ? `cover-${recyclingKey}` : undefined} accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} disabled={!onPress} style={[styles.cover, shape, { borderRadius: corner, backgroundColor: asset ? c.surfaceRaised : tint(title), borderColor: `${c.textPrimary}18` }]}>
    {asset ? (
      <Image source={asset} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={recyclingKey} transition={120} />
    ) : (
      <><View style={[styles.moon, { backgroundColor: c.secondary }]} /><Text numberOfLines={4} style={[styles.coverTitle, { color: c.textPrimary, fontFamily: typography.display }, size === 'tiny' && { fontSize: 7 }]}>{title}</Text><View style={[styles.coverRule, { backgroundColor: c.primary }]} /></>
    )}
    {status ? <View style={[styles.status, { backgroundColor: c.success }]}><Text style={[styles.statusText, { color: c.primaryForeground, fontFamily: typography.bodySemibold }]}>{status}</Text></View> : null}
  </PressableScale>;
}

export function ComicRow({ title, workId, meta, status, label, onPress, recyclingKey }: { title: string; workId?: string; meta?: string; status?: string; label?: 'collect' | 'buy_on_sale' | 'digital_is_fine' | 'try_digital_first' | 'skip'; onPress?: () => void; recyclingKey?: string }) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  // numberOfLines is load-bearing here, not cosmetic: without it a long
  // comic title grows this row taller than its neighbors, which is exactly
  // the "rows don't line up" symptom — every list built on ComicRow
  // (Paths, Compare, Playlists) inherits the fix from one place.
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { borderBottomColor: c.border }, pressed && { opacity: 0.8 }]}><ComicCover title={title} workId={workId} size="list" recyclingKey={recyclingKey ?? title} /><View style={styles.rowBody}><Text numberOfLines={2} ellipsizeMode="tail" style={[styles.rowTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{title}</Text>{meta ? <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.rowMeta, { color: c.textSecondary, fontFamily: typography.body }]}>{meta}</Text> : null}{label ? <PurchaseBadge label={label} /> : status ? <Text numberOfLines={1} style={[styles.rowStatus, { color: c.textMuted, fontFamily: typography.bodyMedium }]}>{status}</Text> : null}</View><Text style={[styles.chevron, { color: c.textSecondary }]}>›</Text></Pressable>;
}

const styles = StyleSheet.create({
  cover: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, padding: 9, justifyContent: 'flex-end', shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 7 },
  moon: { position: 'absolute', right: -10, top: 18, width: 64, height: 64, borderRadius: 32, backgroundColor: '#f1ede6', opacity: 0.88 },
  coverTitle: { color: color.text, fontFamily: font.display, fontSize: 15, lineHeight: 17, textShadowColor: '#000', textShadowRadius: 4 }, coverRule: { width: 20, height: 2, backgroundColor: color.accent, marginTop: 7 },
  status: { position: 'absolute', right: 6, top: 6, backgroundColor: color.positive, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }, statusText: { color: color.text, fontSize: 11, fontFamily: font.bodySemibold },
  row: { minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border }, rowBody: { flex: 1, minWidth: 0, gap: 5 }, rowTitle: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle }, rowMeta: { color: color.muted, fontFamily: font.body, fontSize: type.caption }, rowStatus: { color: color.faint, fontFamily: font.bodyMedium, fontSize: type.caption, textTransform: 'capitalize' }, chevron: { width: 18, color: color.muted, fontSize: 26, textAlign: 'right' },
});
