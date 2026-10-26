// The Library tab: one tidy hub that points at everything you own — files on this phone, your collection, imports, and the extra tools.
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AppShell } from '../../ui/AppShell';
import { Icon, type IconName } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { useAppearance } from '../../ui/theme';
import { space } from '../../ui/tokens';
import { sqlite } from '../../lib/db/client';
import { listCollections } from '../../lib/reader/readerLibrary';
import { pickAndImportComics, pickAndImportFolder, type ImportResult } from '../../lib/reader/importComics';

type Row = { icon: IconName; label: string; sub?: string; tint?: string; onPress: () => void };

export default function LibraryHubScreen() {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const [counts, setCounts] = useState({ phone: 0, collection: 0, collections: 0 });
  const [open, setOpen] = useState({ libraries: true, imports: true, tools: true });
  const [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => {
    const phone = sqlite.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM reader_comics')?.n ?? 0;
    const collection = sqlite.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM user_library WHERE own <> 'none'")?.n ?? 0;
    setCounts({ phone, collection, collections: listCollections().length });
  }, []));

  const runImport = async (fn: () => Promise<ImportResult>) => {
    setBusy(true);
    try {
      const r = await fn();
      if (r.failed.length) Alert.alert('Some files could not be imported', r.failed.map((f) => `${f.name}: ${f.reason}`).join('\n\n'));
      else if (r.imported.length) router.push('/reader/phone');
    } finally { setBusy(false); }
  };
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  const libraries: Row[] = [
    { icon: 'phone-portrait-outline', label: 'On My Phone', sub: plural(counts.phone, 'comic', 'comics'), onPress: () => router.push('/reader/phone') },
    { icon: 'albums-outline', label: 'My Collection', sub: plural(counts.collection, 'comic', 'comics'), onPress: () => router.push('/collection') },
    { icon: 'folder-open-outline', label: 'Collections', sub: plural(counts.collections, 'collection', 'collections'), onPress: () => router.push('/reader/collections') },
  ];
  const imports: Row[] = [
    { icon: 'document-outline', label: busy ? 'Importing…' : 'Import from Files', tint: '#3B82F6', onPress: () => { if (!busy) void runImport(() => pickAndImportComics({})); } },
    { icon: 'folder-outline', label: 'Import a folder', tint: '#3B82F6', onPress: () => { if (!busy) void runImport(pickAndImportFolder); } },
    { icon: 'server-outline', label: 'Connect a server (OPDS)', onPress: () => router.push('/reader/opds') },
    { icon: 'scan-outline', label: 'Scan a comic or shelf', onPress: () => router.push('/scan') },
  ];
  const tools: Row[] = [
    { icon: 'list-outline', label: 'Playlists', onPress: () => router.push('/playlists') },
    { icon: 'git-compare-outline', label: 'Compare comics', onPress: () => router.push('/compare') },
    { icon: 'sparkles-outline', label: 'Mind Space', sub: 'Screenshots to your taste', onPress: () => router.push('/mind') },
    { icon: 'wallet-outline', label: 'Comic Wallet', onPress: () => router.push('/wallet') },
    { icon: 'git-network-outline', label: 'Paths', sub: 'Reading journeys', onPress: () => router.push('/paths') },
  ];

  const group = (title: string, key: keyof typeof open, rows: Row[], delay: number) => (
    <Animated.View entering={FadeInDown.delay(delay).duration(380)}>
      <Pressable accessibilityRole="button" onPress={() => setOpen((o) => ({ ...o, [key]: !o[key] }))} style={styles.groupHead} hitSlop={6}>
        <Text style={[styles.groupTitle, { color: c.textPrimary, fontFamily: typography.display }]}>{title}</Text>
        <Icon name={open[key] ? 'chevron-down' : 'chevron-forward'} size={18} color={c.primary} />
      </Pressable>
      {open[key] ? (
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          {rows.map((row, i) => (
            <PressableScale key={row.label} to={0.985} onPress={row.onPress} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
              <View style={styles.rowIcon}><Icon name={row.icon} size={24} color={row.tint ?? c.textSecondary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: c.textPrimary, fontFamily: typography.bodyMedium }]}>{row.label}</Text>
                {row.sub ? <Text style={[styles.rowSub, { color: c.textMuted, fontFamily: typography.body }]}>{row.sub}</Text> : null}
              </View>
              <Icon name="chevron-forward" size={18} color={c.textMuted} />
            </PressableScale>
          ))}
        </View>
      ) : null}
    </Animated.View>
  );

  return (
    <AppShell active="library" title="Library">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {group('Libraries', 'libraries', libraries, 0)}
        {group('Import', 'imports', imports, 80)}
        {group('Tools', 'tools', tools, 160)}
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: 130 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 22, marginBottom: 10, alignSelf: 'flex-start' },
  groupTitle: { fontSize: 22, letterSpacing: -0.4 },
  card: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 62, paddingVertical: 10 },
  rowIcon: { width: 28, alignItems: 'center' },
  rowLabel: { fontSize: 16 },
  rowSub: { fontSize: 12.5, marginTop: 2 },
});
