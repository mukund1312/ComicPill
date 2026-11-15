import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Cover, ScoreBadge, SectionTitle, SmallButton, VerdictChip } from './ui';
import { useNotQuite } from './NotQuite';
import type { Digest, DigestCard } from '../../lib/mind/engine/digest';
import { getSeriesRow } from '../../lib/mind/queries';
import { buildAndSaveDigest } from '../../lib/mind/digestDb';
import { EmptyState } from '../../ui/primitives';
import { space, type } from '../../ui/tokens';

import { useThemed, type Palette, type Fonts } from '../../ui/theme';
import type { MindData } from './useMindData';

export default function DigestTab({ data, refresh, goInbox }: { data: MindData; refresh: () => void; goInbox: () => void }) {
  const { styles } = useThemed(makeStyles);
  const [viewing, setViewing] = useState<Digest | null>(null);
  const notQuite = useNotQuite(() => { try { buildAndSaveDigest(); } catch { /* keep the old one */ } refresh(); });
  const digest = viewing ?? data.digest;

  if (!digest || digest.cards.length + digest.upNext.length === 0) {
    return (
      <View>
        <EmptyState mark="◇" title="No plan yet" copy="Add screenshots of comics you want to try, or add a comic from the Library tab. The week’s plan builds itself here." action="Add screenshots" onAction={goInbox} />
        {data.past.length ? <PastWeeks past={data.past} onPick={setViewing} /> : null}
      </View>
    );
  }

  return (
    <View style={{ gap: space.md }}>
      {viewing ? <Pressable onPress={() => setViewing(null)}><Text style={styles.back}>‹ Back to this week</Text></Pressable> : null}
      <Text style={styles.week}>Week of {digest.week} · room for {digest.capacity} {digest.capacity === 1 ? 'issue or volume' : 'issues or volumes'}</Text>
      <Text style={styles.headline}>{digest.headline}</Text>
      {digest.cards.map((c) => <DigestCardView key={c.seriesId} card={c} onNotQuite={() => { const s = getSeriesRow(c.seriesId); if (s) notQuite.open(s); }} />)}
      {digest.upNext.length ? <SectionTitle>Up next</SectionTitle> : null}
      {digest.upNext.map((c) => <DigestCardView key={c.seriesId} card={c} compact onNotQuite={() => { const s = getSeriesRow(c.seriesId); if (s) notQuite.open(s); }} />)}
      {!viewing && data.past.length ? <PastWeeks past={data.past} onPick={setViewing} /> : null}
      {notQuite.sheets}
    </View>
  );
}

function PastWeeks({ past, onPick }: { past: Digest[]; onPick: (d: Digest) => void }) {
  const { styles } = useThemed(makeStyles);
  return (
    <View>
      <SectionTitle>Past weeks</SectionTitle>
      {past.slice(0, 8).map((d) => (
        <Pressable key={d.week} onPress={() => onPick(d)} style={styles.pastRow}>
          <Text style={styles.pastText}>Week of {d.week}</Text><Text style={styles.pastSub}>{d.cards.length} this week · {d.upNext.length} up next</Text>
        </Pressable>
      ))}
    </View>
  );
}

function DigestCardView({ card, compact, onNotQuite }: { card: DigestCard; compact?: boolean; onNotQuite: () => void }) {
  const { styles } = useThemed(makeStyles);
  const known = !card.unverified || card.confidence !== 'low';
  return (
    <Card onPress={() => router.push(`/mind/series/${encodeURIComponent(card.seriesId)}`)}>
      <View style={styles.row}>
        <Cover uri={card.coverUrl ?? card.thumbUri} width={compact ? 48 : 64} />
        <View style={styles.main}>
          <Text numberOfLines={2} style={styles.title}>{card.title}</Text>
          {card.unverified ? <Text style={styles.warn}>Not found in a comics database — unverified</Text> : null}
          <Text numberOfLines={2} style={styles.reason}>{card.reason || 'Not enough ratings yet to say why.'}</Text>
        </View>
        <ScoreBadge score={card.score} confidence={card.confidence} known={known} size={compact ? 'sm' : 'md'} />
      </View>
      {!compact ? (
        <>
          {card.order.readFirst.length ? (
            <View><Text style={styles.label}>Read first</Text>
              {card.order.readFirst.map((p) => <Text key={p.id} style={styles.line}>{p.title} · {p.units} {p.units === 1 ? 'vol.' : 'vols.'}{p.importance === 'helpful' ? ' (helpful)' : ''}{p.confidence === 'ai_suggested' ? ' ⚠' : ''}</Text>)}
            </View>
          ) : null}
          {card.order.then.length ? <View><Text style={styles.label}>Then</Text>{card.order.then.map((p) => <Text key={p.id} style={styles.line}>{p.title}{p.confidence === 'ai_suggested' ? ' ⚠' : ''}</Text>)}</View> : null}
          {card.plan.length ? <View><Text style={styles.label}>When</Text>{card.plan.map((p, i) => <Text key={i} style={styles.line}>{p}</Text>)}</View> : null}
        </>
      ) : null}
      <View style={styles.verdictRow}>
        <VerdictChip outcome={card.verdict.outcome} />
        <SmallButton label="Not quite" kind="ghost" onPress={onNotQuite} />
      </View>
      {!compact ? <Text style={styles.why}>{card.verdict.reason}</Text> : null}
    </Card>
  );
}

const makeStyles = (color: Palette, font: Fonts) => StyleSheet.create({
  week: { color: color.muted, fontFamily: font.body, fontSize: type.caption },
  headline: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle, lineHeight: 24 },
  back: { color: color.accent, fontFamily: font.bodySemibold, fontSize: type.body },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  main: { flex: 1, gap: 4 },
  title: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle },
  reason: { color: color.muted, fontFamily: font.body, fontSize: type.caption, lineHeight: 18 },
  warn: { color: color.warning, fontFamily: font.bodyMedium, fontSize: 11 },
  label: { color: color.faint, fontFamily: font.bodySemibold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },
  line: { color: color.text, fontFamily: font.body, fontSize: type.caption, lineHeight: 19 },
  verdictRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  why: { color: color.muted, fontFamily: font.body, fontSize: type.caption, lineHeight: 18 },
  pastRow: { paddingVertical: space.md, borderTopWidth: 1, borderTopColor: color.border },
  pastText: { color: color.text, fontFamily: font.bodyMedium, fontSize: type.body },
  pastSub: { color: color.faint, fontFamily: font.body, fontSize: type.caption },
});
