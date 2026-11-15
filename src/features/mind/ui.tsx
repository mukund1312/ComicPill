import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { Confidence } from '../../lib/mind/engine/tasteScorer';
import { OUTCOME_LABEL, type Outcome } from '../../lib/mind/engine/verdictRules';
import type { ShotStatus } from '../../lib/mind/model';
import { COVER_ASSETS } from '../../ui/coverAssets';
import { font, radius, space, type } from '../../ui/tokens';
import { useThemed, type Palette } from '../../ui/theme';

const scoreColor = (s: number, color: Palette) => (s >= 80 ? color.positive : s >= 60 ? color.warning : color.accent);

/** 0–100, greyed out when the app doesn't have enough of your ratings to be sure. */
export function ScoreBadge({ score, confidence, known = true, size = 'md' }: { score: number; confidence: Confidence; known?: boolean; size?: 'sm' | 'md' }) {
  const { color, styles } = useThemed(makeStyles);
  const low = confidence === 'low' || !known;
  const dim = size === 'sm';
  return (
    <View style={[styles.badge, dim && styles.badgeSm, { borderColor: low ? color.faint : scoreColor(score, color) }]} accessibilityLabel={known ? `Taste score ${score}${low ? ', low confidence' : ''}` : 'No score yet'}>
      <Text style={[styles.badgeNum, dim && styles.badgeNumSm, { color: low ? color.faint : scoreColor(score, color) }]}>{known ? score : '–'}</Text>
      {size === 'md' ? <Text style={styles.badgeLabel}>{!known ? 'no score' : low ? 'low confidence' : 'taste'}</Text> : null}
    </View>
  );
}

const outcomeColor = (color: Palette): Record<Outcome, string> => ({ buy_physical: color.collectGold, digital: color.digital, borrow: color.tryDigital, wait_sale: color.warning });

export function VerdictChip({ outcome }: { outcome: Outcome }) {
  const { color, styles } = useThemed(makeStyles);
  return <View style={[styles.chip, { borderColor: outcomeColor(color)[outcome] }]}><Text style={[styles.chipText, { color: outcomeColor(color)[outcome] }]}>{OUTCOME_LABEL[outcome]}</Text></View>;
}

export const SHOT_LABEL: Record<ShotStatus, string> = {
  new: 'Checking…', skipped: 'Skipped', sensitive: 'Private — never sent', awaiting_approval: 'Waiting for you', queued: 'Waiting to send', processing: 'Processing', ready: 'Ready', needs_review: 'Needs your eye', error: 'Couldn’t read',
};
const shotColor = (color: Palette): Partial<Record<ShotStatus, string>> => ({ ready: color.positive, needs_review: color.warning, processing: color.digital, queued: color.digital, error: color.accent, awaiting_approval: color.warning });

export function StatusChip({ status }: { status: ShotStatus }) {
  const { color, styles } = useThemed(makeStyles);
  const c = shotColor(color)[status] ?? color.faint;
  return <View style={[styles.chip, { borderColor: c }]}><Text style={[styles.chipText, { color: c }]}>{SHOT_LABEL[status]}</Text></View>;
}

/** `local:<workId>` means a book from ComicPill's own catalog, whose cover ships with the app. */
export function Cover({ uri, width = 64, children }: { uri: string | null | undefined; width?: number; children?: ReactNode }) {
  const { styles } = useThemed(makeStyles);
  const asset = uri?.startsWith('local:') ? COVER_ASSETS[uri.slice(6)] : undefined;
  const source = asset ?? (uri && !uri.startsWith('local:') ? { uri } : null);
  return (
    <View style={[styles.cover, { width, height: width * 1.5 }]}>
      {source ? <Image source={source} style={styles.fill} contentFit="cover" transition={120} /> : <Text style={styles.coverGlyph}>▤</Text>}
      {children}
    </View>
  );
}

export function SectionTitle({ children, action, onAction }: { children: string; action?: string; onAction?: () => void }) {
  const { styles } = useThemed(makeStyles);
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section}>{children}</Text>
      {action ? <Pressable onPress={onAction} hitSlop={10}><Text style={styles.sectionAction}>{action}</Text></Pressable> : null}
    </View>
  );
}

export function Card({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: object }) {
  const { styles } = useThemed(makeStyles);
  const body = <View style={[styles.card, style]}>{children}</View>;
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress}>{body}</Pressable> : body;
}

export function SmallButton({ label, onPress, kind = 'secondary', disabled }: { label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'ghost'; disabled?: boolean }) {
  const { styles } = useThemed(makeStyles);
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.btn, kind === 'primary' && styles.btnPrimary, kind === 'ghost' && styles.btnGhost, disabled && { opacity: 0.4 }]}>
      <Text style={[styles.btnText, kind === 'primary' && styles.btnTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

/** A relation's source: Verified (from a database) or AI-suggested, which carries a warning and a "looks wrong" button. */
export function ConfidenceTag({ confidence }: { confidence: 'verified' | 'ai_suggested' }) {
  const { styles } = useThemed(makeStyles);
  return confidence === 'verified'
    ? <Text style={styles.verified}>✓ Verified</Text>
    : <Text style={styles.suggested}>⚠ AI-suggested</Text>;
}

export const relativeTime = (ms: number, now = Date.now()): string => {
  const d = Math.max(0, now - ms); const m = Math.round(d / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24); return days === 1 ? 'yesterday' : `${days} days ago`;
};

const makeStyles = (color: Palette) => StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  badge: { minWidth: 64, paddingHorizontal: space.sm, paddingVertical: 6, borderRadius: radius.md, borderWidth: 2, alignItems: 'center' },
  badgeSm: { minWidth: 36, paddingVertical: 2, paddingHorizontal: 6 },
  badgeNum: { fontFamily: font.displayMedium, fontSize: 26, lineHeight: 30 },
  badgeNumSm: { fontSize: 15, lineHeight: 18 },
  badgeLabel: { color: color.faint, fontFamily: font.bodyMedium, fontSize: 10 },
  chip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1 },
  chipText: { fontFamily: font.bodySemibold, fontSize: 12 },
  cover: { borderRadius: radius.sm, backgroundColor: color.surface2, overflow: 'hidden', borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  coverGlyph: { color: color.faint, fontSize: 24 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: space.lg, marginBottom: space.sm },
  section: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle },
  sectionAction: { color: color.accent, fontFamily: font.bodyMedium, fontSize: type.caption },
  card: { backgroundColor: color.surface, borderRadius: radius.md, borderWidth: 1, borderColor: color.border, padding: space.md, gap: space.sm },
  btn: { minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface2 },
  btnPrimary: { backgroundColor: color.accent, borderColor: color.accent },
  btnGhost: { backgroundColor: 'transparent' },
  btnText: { color: color.text, fontFamily: font.bodyMedium, fontSize: type.caption },
  btnTextPrimary: { fontFamily: font.bodySemibold },
  verified: { color: color.positive, fontFamily: font.bodyMedium, fontSize: 11 },
  suggested: { color: color.warning, fontFamily: font.bodyMedium, fontSize: 11 },
});
