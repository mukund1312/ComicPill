import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ActionSheet, PromptModal, type SheetOption } from '../reader/dialogs';
import { Card, SHOT_LABEL, SmallButton, StatusChip, relativeTime } from './ui';
import { pickScreenshots } from '../../lib/mind/capture/pick';
import { makeDeps } from '../../lib/mind/deps';
import type { CaptureRow, ShotRow } from '../../lib/mind/model';
import { approveScreenshots, chooseOption, dismissCapture, dismissScreenshot, keepUnverified, reresolveCapture } from '../../lib/mind/pipeline';
import { useMindSettings } from '../../lib/mind/settings';
import { sqliteStore } from '../../lib/mind/sqliteStore';
import { syncMind } from '../../lib/mind/sync';
import { EmptyState } from '../../ui/primitives';
import { color, font, radius, space, type } from '../../ui/tokens';
import type { MindData } from './useMindData';

const DAY = 24 * 60 * 60 * 1000;

export default function InboxTab({ data, refresh }: { data: MindData; refresh: () => void }) {
  const settings = useMindSettings();
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string> | null>(null); // null = everything pre-selected
  const [sheet, setSheet] = useState<{ title?: string; options: SheetOption[] } | null>(null);
  const [prompt, setPrompt] = useState<{ capture: CaptureRow } | null>(null);

  const awaiting = useMemo(() => data.shots.filter((s) => s.status === 'awaiting_approval'), [data.shots]);
  // Comparing against the newest screenshot (not the clock) keeps this pure while still meaning "the last few days".
  const newest = data.shots[0]?.takenAt ?? 0;
  const recent = useMemo(() => data.shots.filter((s) => s.takenAt > newest - 3 * DAY), [data.shots, newest]);
  const hidden = data.shots.filter((s) => s.status === 'skipped' || s.status === 'sensitive').length;
  const shown = data.shots.filter((s) => s.status !== 'skipped' && s.status !== 'sensitive' && s.status !== 'awaiting_approval');
  const stuck = data.shots.filter((x) => x.status === 'queued');
  const selected = (id: string) => (picked ? picked.has(id) : true);
  const selectedIds = awaiting.filter((s) => selected(s.id)).map((s) => s.id);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch { Alert.alert('Something went wrong', 'Try again in a moment.'); } finally { setBusy(null); refresh(); }
  };

  const scanNow = () => run('Reading…', async () => { await syncMind(); });
  const addShots = () => run('Adding…', async () => { if (await pickScreenshots(sqliteStore)) await syncMind(); });
  const send = () => run('Sending…', async () => {
    approveScreenshots(selectedIds, sqliteStore);
    for (const s of awaiting) if (!selectedIds.includes(s.id)) dismissScreenshot(s.id, sqliteStore);
    setPicked(null);
    await syncMind();
  });
  const skipAll = () => { for (const s of awaiting) dismissScreenshot(s.id, sqliteStore); refresh(); };

  const resolve = (shot: ShotRow) => {
    const open = sqliteStore.listCaptures(shot.id).filter((c) => c.status === 'needs_choice' || c.status === 'needs_review' || c.status === 'unmatched');
    if (!open.length) { if (shot.status === 'queued' || shot.status === 'error') Alert.alert(SHOT_LABEL[shot.status], shot.error ?? ''); return; }
    const capture = open[0];
    const fresh = () => sqliteStore.getCapture(capture.id)!;
    if (capture.status === 'needs_choice' && capture.options) {
      setSheet({ title: `Which “${capture.title}”?`, options: [
        ...capture.options.map((o, i) => ({ label: `${o.series.title}${o.series.year ? ` (${o.series.year})` : ''}${o.series.creators[0] ? ` — ${o.series.creators[0]}` : ''}`, onPress: () => run('Saving…', async () => { await chooseOption(fresh(), i, await makeDeps()); }) })),
        { label: 'None of these — type the title', onPress: () => setPrompt({ capture }) },
        { label: 'Not a comic', destructive: true, onPress: () => { dismissCapture(capture, sqliteStore); refresh(); } },
      ] });
    } else if (capture.status === 'unmatched') {
      setSheet({ title: `“${capture.title}” isn’t in any database`, options: [
        { label: 'Keep it as an unverified card', onPress: () => { keepUnverified(capture, sqliteStore); refresh(); } },
        { label: 'Fix the title and search again', onPress: () => setPrompt({ capture }) },
        { label: 'Dismiss', destructive: true, onPress: () => { dismissCapture(capture, sqliteStore); refresh(); } },
      ] });
    } else {
      setSheet({ title: `Shaky read: “${capture.title}”`, options: [
        { label: 'Fix the title and search', onPress: () => setPrompt({ capture }) },
        { label: 'Not a comic', destructive: true, onPress: () => { dismissCapture(capture, sqliteStore); refresh(); } },
      ] });
    }
  };

  if (data.shots.length === 0) {
    return <EmptyState mark="◇" title="Add comic screenshots" copy="Pick screenshots of comics you want to try. ComicPill reads the text on your phone first, and sends nothing without your say-so. It never looks at the rest of your photos." action="Choose screenshots" onAction={addShots} />;
  }

  return (
    <View style={{ gap: space.md }}>
      <View style={styles.actions}>
        <SmallButton label={busy ?? 'Add screenshots'} kind="primary" disabled={!!busy} onPress={addShots} />
        <SmallButton label="Read again" disabled={!!busy} onPress={scanNow} />
        {busy ? <ActivityIndicator color={color.accent} /> : null}
      </View>

      {awaiting.length ? (
        <Card>
          <Text style={styles.reviewTitle}>{awaiting.length} of {Math.max(recent.length, awaiting.length)} recent screenshots look comic-related. Send them?</Text>
          <Text style={styles.small}>Only the ones ticked are sent, shrunk, with location data removed. {hidden ? `${hidden} private or unrelated screenshot${hidden === 1 ? '' : 's'} never left your phone.` : ''}</Text>
          <View style={styles.grid}>
            {awaiting.map((s) => (
              <Pressable key={s.id} onPress={() => setPicked((cur) => { const next = new Set(cur ?? awaiting.map((a) => a.id)); if (next.has(s.id)) next.delete(s.id); else next.add(s.id); return next; })} style={[styles.thumb, selected(s.id) && styles.thumbOn]}>
                <Image source={{ uri: s.uri }} style={styles.thumbImg} contentFit="cover" recyclingKey={s.id} />
                <Text style={styles.tick}>{selected(s.id) ? '✓' : ''}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.actions}>
            <SmallButton label={`Send ${selectedIds.length}`} kind="primary" disabled={!!busy || selectedIds.length === 0} onPress={send} />
            <SmallButton label="Skip all" kind="ghost" onPress={skipAll} />
          </View>
          {!settings.autoSend ? <Text style={styles.small}>Tired of this step? Turn on auto-send in settings once you trust it.</Text> : null}
        </Card>
      ) : null}

      {stuck.length ? (
        <Card>
          <Text style={styles.reviewTitle}>{stuck.length} screenshot{stuck.length === 1 ? ' is' : 's are'} waiting to be read</Text>
          <Text style={styles.small}>{stuck.find((x) => x.error)?.error ?? 'They send as soon as the phone is online.'}</Text>
          <View style={styles.actions}>
            {/key/i.test(stuck.find((x) => x.error)?.error ?? '') ? <SmallButton label="Add API key" kind="primary" onPress={() => router.push('/ai-settings')} /> : null}
            <SmallButton label="Try again" disabled={!!busy} onPress={scanNow} />
          </View>
        </Card>
      ) : null}
      {shown.length === 0 && !awaiting.length ? <EmptyState mark="◇" title="Inbox is clear" copy="Add screenshots of comics and they show up here once ComicPill has read them." /> : null}
      {shown.map((s) => (
        <Pressable key={s.id} onPress={() => resolve(s)}>
          <View style={styles.item}>
            <Image source={{ uri: s.uri }} style={styles.itemImg} contentFit="cover" recyclingKey={s.id} />
            <View style={styles.itemBody}>
              <StatusChip status={s.status} />
              <Text numberOfLines={2} style={styles.itemTitle}>{s.summary ?? (s.status === 'queued' ? 'Waiting to send' : s.gateReason ?? 'Screenshot')}</Text>
              {s.error ? <Text numberOfLines={2} style={styles.err}>{s.error}</Text> : null}
              <Text style={styles.small}>{relativeTime(s.takenAt)}</Text>
            </View>
          </View>
        </Pressable>
      ))}
      {hidden ? <Text style={styles.small}>{hidden} screenshot{hidden === 1 ? '' : 's'} skipped (private or not about comics). They were never uploaded.</Text> : null}

      <ActionSheet visible={!!sheet} title={sheet?.title} options={sheet?.options ?? []} onClose={() => setSheet(null)} />
      <PromptModal visible={!!prompt} title="Title of the comic" initial={prompt?.capture.title} submitLabel="Search"
        onSubmit={(title) => { const c = prompt!.capture; run('Searching…', async () => { const r = await reresolveCapture(c, title, await makeDeps()); if (r === 'offline') Alert.alert('No connection', 'Try again when you’re back online.'); }); }}
        onClose={() => setPrompt(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' },
  reviewTitle: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle, lineHeight: 24 },
  small: { color: color.muted, fontFamily: font.body, fontSize: 12, lineHeight: 17 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  thumb: { width: 84, height: 140, borderRadius: radius.sm, overflow: 'hidden', borderWidth: 2, borderColor: color.border, opacity: 0.55 },
  thumbOn: { borderColor: color.accent, opacity: 1 },
  thumbImg: { width: '100%', height: '100%' },
  tick: { position: 'absolute', top: 4, right: 6, color: color.text, fontSize: 16, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 4 },
  item: { flexDirection: 'row', gap: space.md, backgroundColor: color.surface, borderRadius: radius.md, borderWidth: 1, borderColor: color.border, padding: space.sm },
  itemImg: { width: 56, height: 96, borderRadius: radius.sm, backgroundColor: color.surface2 },
  itemBody: { flex: 1, gap: 4, justifyContent: 'center' },
  itemTitle: { color: color.text, fontFamily: font.displayMedium, fontSize: type.body },
  err: { color: color.warning, fontFamily: font.body, fontSize: 12 },
});
