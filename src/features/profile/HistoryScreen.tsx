// Your reading history: everything finished or in progress, newest first,
// straight from your library (not a sample).
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ComicCover } from '../../ui/comic';
import { SettingsPage } from '../../ui/SettingsPage';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { loadHistory } from '../../lib/db/queries/profileData';
import { historyLine } from '../../lib/settings/profileStats';

export default function HistoryScreen() {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const [tick, setTick] = useState(0);
  useFocusEffect(useCallback(() => { setTick((t) => t + 1); }, []));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => loadHistory(), [tick]);
  const now = new Date();

  return (
    <SettingsPage title="Reading history" subtitle={rows.length ? `${rows.length} ${rows.length === 1 ? 'book' : 'books'}, most recent first.` : undefined} backLabel="Profile">
      {rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: c.textPrimary, fontFamily: typography.display }]}>Nothing here yet.</Text>
          <Text style={[styles.emptyCopy, { color: c.textSecondary, fontFamily: typography.body }]}>Mark a comic as reading or finished and it shows up here.</Text>
        </View>
      ) : rows.map((r) => (
        <Pressable key={r.workId} accessibilityRole="button" onPress={() => router.push(`/comic/${r.workId}`)} style={({ pressed }) => [styles.row, { borderBottomColor: c.border }, pressed && { opacity: 0.7 }]}>
          <ComicCover title={r.title} workId={r.workId} size="tiny" recyclingKey={`history-${r.workId}`} />
          <View style={styles.text}>
            <Text numberOfLines={2} style={[styles.title, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{r.title}</Text>
            <Text style={[styles.meta, { color: c.textSecondary, fontFamily: typography.body }]}>{historyLine(r, now)}</Text>
          </View>
        </Pressable>
      ))}
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  text: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 16 },
  meta: { fontSize: 14 },
  empty: { paddingVertical: 64, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 22 },
  emptyCopy: { fontSize: 14, textAlign: 'center' },
});
