import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Card, ConfidenceTag, Cover, ScoreBadge, SectionTitle, SmallButton, VerdictChip } from './ui';
import { useNotQuite } from './NotQuite';
import { ActionSheet, PromptModal, type SheetOption } from '../reader/dialogs';
import { readingOrder } from '../../lib/mind/engine/readingPlanner';
import { SIGNAL_LABEL } from '../../lib/mind/engine/tasteScorer';
import type { ReadStatus } from '../../lib/mind/engine/types';
import { buildAndSaveDigest } from '../../lib/mind/digestDb';
import { getSeriesRow, loadGraph, markRelationWrong, rate, ratingOf, relationsDetail, setOverride, setReadStatus, sourcesOf } from '../../lib/mind/queries';
import { recordSpend, useMindSettings } from '../../lib/mind/settings';
import { makeScorer, verdictFor, volumesOf } from '../../lib/mind/taste';
import { SettingsPage } from '../../ui/SettingsPage';
import { color, font, radius, space, type } from '../../ui/tokens';

const STATUS_LABEL: Record<ReadStatus, string> = { planned: 'Planned', reading: 'Reading', finished: 'Finished', dropped: 'Dropped' };

export default function SeriesScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = decodeURIComponent(String(rawId));
  const settings = useMindSettings();
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => { try { buildAndSaveDigest(); } catch { /* ignore */ } setTick((t) => t + 1); }, []);
  useFocusEffect(useCallback(() => { setTick((t) => t + 1); }, []));
  const notQuite = useNotQuite(refresh);
  const [sheet, setSheet] = useState<{ title?: string; options: SheetOption[] } | null>(null);
  const [prompt, setPrompt] = useState<'disagree' | 'spend' | null>(null);

  const view = useMemo(() => {
    const row = getSeriesRow(id);
    if (!row) return null;
    const graph = loadGraph();
    const scorer = makeScorer(settings.weights);
    const scored = scorer.score(row);
    return {
      row, scored, order: readingOrder(id, graph.series, graph.edges), titles: graph.series,
      verdict: verdictFor(row, scored, settings), rating: ratingOf(id), sources: sourcesOf(id),
      ignored: relationsDetail(id).filter((r) => r.wrong),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tick, settings]);

  if (!view) return <SettingsPage title="Not found" subtitle="This comic isn’t in your Mind Space any more." />;
  const { row, scored, order, verdict, rating, sources, ignored, titles } = view;
  const setStatus = (s: ReadStatus) => { setReadStatus(row.id, s); refresh(); };

  const why = () => setSheet({
    title: `Why ${scored.score}?`,
    options: scored.result
      ? scored.result.breakdown.map((b) => ({
        label: `${SIGNAL_LABEL[b.signal]} (${Math.round(b.weight * 100)}%): ${b.known ? b.contributions.map((c) => `${c.tag} ${c.value >= 0 ? '+' : ''}${c.value.toFixed(1)}`).join(', ') : 'nothing in your ratings yet'}`, onPress: () => undefined,
      }))
      : [{ label: scored.reasons.join(' '), onPress: () => undefined }],
  });

  return (
    <SettingsPage title={row.title} subtitle={[row.year, row.publisher, row.creators.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}>
      <View>
        <View style={styles.hero}>
          <Cover uri={row.coverUrl ?? sources[0]?.uri} width={104} />
          <View style={{ flex: 1, gap: space.sm }}>
            <ScoreBadge score={scored.score} confidence={scored.confidence} known={scored.known} />
            <Text style={styles.body}>{scored.reasons.slice(0, 2).join('. ')}</Text>
            <View style={styles.row}><SmallButton label="Why this score?" onPress={why} /><SmallButton label="I disagree" kind="ghost" onPress={() => setPrompt('disagree')} /></View>
            {scored.overridden ? <SmallButton label="Use the app’s score again" kind="ghost" onPress={() => { setOverride(row.id, null); refresh(); }} /> : null}
          </View>
        </View>
        {!row.verified ? <Text style={styles.warn}>Not found in a comics database, so this is unverified: no reading order or details, and the score rests on little.</Text> : null}
        {row.description ? <Text style={[styles.body, { marginTop: space.md }]} numberOfLines={8}>{row.description}</Text> : null}

        <SectionTitle>Where you are</SectionTitle>
        <View style={styles.row}>
          {(['planned', 'reading', 'finished', 'dropped'] as ReadStatus[]).map((s) => <SmallButton key={s} label={STATUS_LABEL[s]} kind={row.readStatus === s ? 'primary' : 'secondary'} onPress={() => setStatus(s)} />)}
        </View>
        {row.readStatus === 'finished' || row.readStatus === 'dropped' ? (
          <View style={{ marginTop: space.sm }}>
            <Text style={styles.small}>Your rating (it teaches the scores):</Text>
            <View style={styles.row}>{[1, 2, 3, 4, 5].map((n) => <Pressable key={n} hitSlop={6} onPress={() => { rate(row.id, n, row.readStatus === 'dropped'); refresh(); }}><Text style={[styles.star, (rating?.rating ?? 0) >= n && !rating?.dropped && { color: color.collectGold }]}>★</Text></Pressable>)}</View>
          </View>
        ) : null}

        <SectionTitle>Reading order</SectionTitle>
        {order.readFirst.length === 0 && order.then.length === 0 ? <Text style={styles.small}>{row.verified ? 'Nothing to read before this one — start anywhere.' : 'No reading order known.'}</Text> : null}
        {order.readFirst.length ? <Text style={styles.label}>Read first · {order.unitsToRead} {order.unitsToRead === 1 ? 'volume' : 'volumes'} to go</Text> : null}
        {order.readFirst.map((p) => (
          <View key={p.id} style={styles.relRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.body}>{p.title}</Text>
              <Text style={styles.small}>{p.importance === 'required' ? 'Required' : 'Helpful'} · {p.units} {p.units === 1 ? 'vol.' : 'vols.'} · <ConfidenceTag confidence={p.confidence} /></Text>
              {p.confidence === 'ai_suggested' ? <Text style={styles.warnSmall}>Suggested by the AI, not confirmed by a database.</Text> : null}
            </View>
            {p.edge ? <SmallButton label="Looks wrong" kind="ghost" onPress={() => { markRelationWrong(p.edge!.before, p.edge!.after); refresh(); }} /> : null}
          </View>
        ))}
        {order.then.length ? <Text style={styles.label}>Then</Text> : null}
        {order.then.map((p) => (
          <View key={p.id} style={styles.relRow}>
            <View style={{ flex: 1 }}><Text style={styles.body}>{p.title}</Text><Text style={styles.small}>{p.importance === 'required' ? 'Direct continuation' : 'Worth it if you like this'} · <ConfidenceTag confidence={p.confidence} /></Text></View>
            {p.edge ? <SmallButton label="Looks wrong" kind="ghost" onPress={() => { markRelationWrong(p.edge!.before, p.edge!.after); refresh(); }} /> : null}
          </View>
        ))}
        {ignored.length ? (
          <View style={{ marginTop: space.sm }}>
            <Text style={styles.small}>Links you said look wrong (ignored):</Text>
            {ignored.map((r) => <Pressable key={`${r.before}>${r.after}`} onPress={() => { markRelationWrong(r.before, r.after, false); refresh(); }}><Text style={styles.link}>↺ {titles.get(r.before)?.title ?? r.before} → {titles.get(r.after)?.title ?? r.after} · restore</Text></Pressable>)}
          </View>
        ) : null}

        <SectionTitle>Physical or digital?</SectionTitle>
        <Card>
          <VerdictChip outcome={verdict.outcome} />
          <Text style={styles.body}>{verdict.reason}</Text>
          <Text style={styles.small}>Rule that fired: {verdict.ruleLabel}.{settings.shelfTight && verdict.outcome === 'buy_physical' ? ' Your shelf space is tight — worth a second thought.' : ''}</Text>
          <View style={styles.row}>
            <SmallButton label="Not quite" kind="ghost" onPress={() => notQuite.open(row)} />
            {verdict.outcome === 'buy_physical' ? <SmallButton label="I bought it" onPress={() => setPrompt('spend')} /> : null}
          </View>
        </Card>

        {sources.length ? (
          <>
            <SectionTitle>Found in</SectionTitle>
            <View style={styles.row}>{sources.slice(0, 6).map((s) => <Image key={s.uri} source={{ uri: s.uri }} style={styles.shot} contentFit="cover" />)}</View>
          </>
        ) : null}
        <View style={{ height: space.xl }} />
      </View>

      {notQuite.sheets}
      <ActionSheet visible={!!sheet} title={sheet?.title} options={sheet?.options ?? []} onClose={() => setSheet(null)} />
      <PromptModal visible={prompt === 'disagree'} title="Your score for it (0–100)" placeholder="e.g. 85" submitLabel="Set score" onSubmit={(v) => { const n = Number.parseInt(v, 10); if (Number.isFinite(n)) { setOverride(row.id, Math.max(0, Math.min(100, n))); refresh(); } }} onClose={() => setPrompt(null)} />
      <PromptModal visible={prompt === 'spend'} title="How much did it cost?" initial={String(Math.round(settings.typicalPrice * Math.max(1, volumesOf(row))))} submitLabel="Add to this month"
        onSubmit={(v) => { const n = Number.parseFloat(v); if (Number.isFinite(n) && n >= 0) { recordSpend(n); setReadStatus(row.id, row.readStatus); refresh(); Alert.alert('Added', 'Counted against this month’s budget.'); } }} onClose={() => setPrompt(null)} />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', alignItems: 'center' },
  body: { color: color.text, fontFamily: font.body, fontSize: type.body, lineHeight: 22 },
  small: { color: color.muted, fontFamily: font.body, fontSize: 12, lineHeight: 17 },
  warn: { color: color.warning, fontFamily: font.bodyMedium, fontSize: type.caption, marginTop: space.md, lineHeight: 18 },
  warnSmall: { color: color.warning, fontFamily: font.body, fontSize: 11 },
  label: { color: color.faint, fontFamily: font.bodySemibold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: space.sm },
  relRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: color.border },
  star: { fontSize: 30, color: color.border },
  link: { color: color.accent, fontFamily: font.bodyMedium, fontSize: 12, marginTop: 4 },
  shot: { width: 64, height: 110, borderRadius: radius.sm, backgroundColor: color.surface2 },
});
