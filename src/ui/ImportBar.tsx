import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Progress } from './primitives';
import { useAppearance } from './theme';
import { space } from './tokens';
import { dismissSummary, stopJob, useJob } from '../lib/reader/importJob';

/** Shows a running import (what it is on, how far along, a Stop button) and, afterwards, how it went. Sits above the tab bar on every screen. */
export function ImportBar() {
  const job = useJob();
  const { theme, typography } = useAppearance(); const c = theme.colors;
  if (!job.running && !job.summary) return null;
  const box = [styles.box, { backgroundColor: c.surfaceRaised, borderColor: c.border }];
  if (!job.running && job.summary) {
    const { text, problems } = job.summary;
    return (
      <View style={box} accessibilityLiveRegion="polite">
        <Text numberOfLines={2} style={[styles.text, { color: c.textPrimary, fontFamily: typography.bodySemibold }]}>{text}</Text>
        {problems.length ? <Pressable hitSlop={8} onPress={() => Alert.alert('What didn’t go in', problems.join('\n\n'))}><Text style={[styles.action, { color: c.primary, fontFamily: typography.bodySemibold }]}>Details</Text></Pressable> : null}
        <Pressable hitSlop={8} onPress={dismissSummary}><Text style={[styles.action, { color: c.primary, fontFamily: typography.bodySemibold }]}>OK</Text></Pressable>
      </View>
    );
  }
  const counting = job.total === 0;
  return (
    <View style={box} accessibilityLiveRegion="polite">
      <View style={styles.body}>
        <Text numberOfLines={1} style={[styles.text, { color: c.textPrimary, fontFamily: typography.bodySemibold }]}>
          {counting ? job.name || job.label : `${job.label} · ${Math.min(job.done + 1, job.total)} of ${job.total}`}
        </Text>
        {!counting ? <Progress value={job.done / job.total} /> : null}
        <Text numberOfLines={1} style={[styles.sub, { color: c.textMuted, fontFamily: typography.body }]}>
          {job.stopping ? 'Stopping after this file…' : job.name && !counting ? job.name : 'Keep ComicPill open; big files take a while.'}
        </Text>
      </View>
      <Pressable disabled={job.stopping} hitSlop={8} onPress={stopJob}><Text style={[styles.action, { color: c.destructive, fontFamily: typography.bodySemibold, opacity: job.stopping ? 0.4 : 1 }]}>Stop</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginHorizontal: space.lg, marginBottom: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: 16, borderWidth: 1 },
  body: { flex: 1, gap: 4 },
  text: { flex: 1, fontSize: 14 },
  sub: { fontSize: 12 },
  action: { fontSize: 15 },
});
