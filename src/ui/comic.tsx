import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, radius, space, type } from './tokens';
import { PurchaseBadge } from './primitives';

const coverColors = ['#5b1015', '#421619', '#182b35', '#302042', '#5b351b', '#172b26', '#402121'];
function tint(title: string) { return coverColors[title.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0) % coverColors.length]; }

/** A fixed 2:3 cover cell. `recyclingKey` is intentionally explicit so the
 * future Expo Image implementation can safely recycle its image request. */
export function ComicCover({ title, size = 'grid', status, onPress, recyclingKey }: { title: string; size?: 'tiny' | 'list' | 'grid' | 'hero'; status?: string; onPress?: () => void; recyclingKey?: string }) {
  const dims = { tiny: [44, 66], list: [58, 86], grid: [104, 156], hero: [132, 198] }[size];
  return <Pressable testID={recyclingKey ? `cover-${recyclingKey}` : undefined} accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} style={({ pressed }) => [styles.cover, { width: dims[0], height: dims[1], backgroundColor: tint(title) }, pressed && { transform: [{ scale: 0.98 }] }]}>
    <View style={styles.moon} /><Text numberOfLines={4} style={[styles.coverTitle, size === 'tiny' && { fontSize: 7 }]}>{title}</Text><View style={styles.coverRule} />
    {status ? <View style={styles.status}><Text style={styles.statusText}>{status}</Text></View> : null}
  </Pressable>;
}

export function ComicRow({ title, meta, status, label, onPress, recyclingKey }: { title: string; meta?: string; status?: string; label?: 'collect' | 'buy_on_sale' | 'digital_is_fine' | 'try_digital_first' | 'skip'; onPress?: () => void; recyclingKey?: string }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}><ComicCover title={title} size="list" recyclingKey={recyclingKey ?? title} /><View style={styles.rowBody}><Text style={styles.rowTitle}>{title}</Text>{meta ? <Text style={styles.rowMeta}>{meta}</Text> : null}{label ? <PurchaseBadge label={label} /> : status ? <Text style={styles.rowStatus}>{status}</Text> : null}</View><Text style={styles.chevron}>›</Text></Pressable>;
}

const styles = StyleSheet.create({
  cover: { overflow: 'hidden', borderRadius: radius.sm, borderWidth: 1, borderColor: '#ffffff20', padding: 9, justifyContent: 'flex-end', shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 10, elevation: 5 },
  moon: { position: 'absolute', right: -10, top: 18, width: 64, height: 64, borderRadius: 32, backgroundColor: '#f1ede6', opacity: 0.88 },
  coverTitle: { color: color.text, fontFamily: font.display, fontSize: 15, lineHeight: 17, textShadowColor: '#000', textShadowRadius: 4 }, coverRule: { width: 20, height: 2, backgroundColor: color.accent, marginTop: 7 },
  status: { position: 'absolute', right: 5, bottom: 5, backgroundColor: color.positive, borderRadius: 8, paddingHorizontal: 4 }, statusText: { color: color.text, fontSize: 8, fontFamily: font.bodySemibold },
  row: { minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border }, rowBody: { flex: 1, gap: 5 }, rowTitle: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle }, rowMeta: { color: color.muted, fontFamily: font.body, fontSize: type.caption }, rowStatus: { color: color.faint, fontFamily: font.bodyMedium, fontSize: type.caption, textTransform: 'capitalize' }, chevron: { color: color.muted, fontSize: 26 },
});
