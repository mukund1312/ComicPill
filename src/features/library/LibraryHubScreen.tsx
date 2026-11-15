// The Library tab: one tidy hub that points at everything you own — files on this phone, your collection, imports, and the extra tools.
import { deviceIcon, deviceName, onMyDevice } from '../../lib/platform/device';
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
import { listCollections, listReaderComics, type ReaderComic } from '../../lib/reader/readerLibrary';
import { Image } from 'expo-image';
import { linkWithCovers, pickAndImportComics, pickAndImportFolder, pickAndLinkComics, pickAndLinkFolder, type ImportProgress, type ImportResult } from '../../lib/reader/importComics';
import { runJob, useJob } from '../../lib/reader/importJob';

type Row = { icon: IconName; label: string; sub?: string; tint?: string; onPress: () => void };

export default function LibraryHubScreen() {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const [counts, setCounts] = useState({ phone: 0, collection: 0, collections: 0 });
  // Your comics lead; adding comics and the extra tools are a tap away (More starts folded so the page stays calm).
  const [open, setOpen] = useState({ libraries: true, imports: true, tools: false });
  const [recent, setRecent] = useState<ReaderComic[]>([]);
  const running = useJob().running;
  useFocusEffect(useCallback(() => {
    const phone = sqlite.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM reader_comics WHERE hidden = 0')?.n ?? 0;
    const collection = sqlite.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM user_library WHERE own <> 'none'")?.n ?? 0;
    setCounts({ phone, collection, collections: listCollections().length });
    setRecent(listReaderComics().filter((comic) => !comic.locked && comic.coverPath).slice(0, 12));
  }, []));

  // Imports run as the app's one background job; the bar at the bottom of every screen shows progress and how it went.
  const runImport = async (label: string, verb: string, fn: (progress: ImportProgress) => Promise<ImportResult>) => {
    const started = await runJob(label, async (progress) => ({ verb, result: await fn(progress) }));
    if (!started) Alert.alert('Another import is running', 'Wait for it to finish, or press Stop on the bar at the bottom.');
  };
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  const libraries: Row[] = [
    { icon: deviceIcon(), label: onMyDevice(), sub: plural(counts.phone, 'comic', 'comics'), onPress: () => router.push('/reader/phone') },
    { icon: 'albums-outline', label: 'My Collection', sub: plural(counts.collection, 'comic', 'comics'), onPress: () => router.push('/collection') },
    { icon: 'folder-open-outline', label: 'Collections', sub: plural(counts.collections, 'collection', 'collections'), onPress: () => router.push('/reader/collections') },
  ];
  // Two ways to bring files in, said plainly: a copy lives on the phone (reads offline, uses space); a link stays in the cloud app and is
  // fetched when opened. Each then asks whether it's a few files or a whole folder, instead of four near-identical rows.
  const busy = () => { if (running) Alert.alert('An import is running', 'Wait for it to finish, or press Stop on the bar at the bottom.'); return running; };
  const filesOrFolder = (title: string, message: string, files: () => void, folder: () => void) => {
    if (busy()) return;
    Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: 'A whole folder', onPress: folder }, { text: 'Files', onPress: files }]);
  };
  const imports: Row[] = [
    { icon: deviceIcon(), label: `Copy to this ${deviceName()}`, sub: 'Reads offline. Uses space here. Pick files or a whole folder.', tint: '#3B82F6',
      onPress: () => filesOrFolder(`Copy to this ${deviceName()}`, 'ComicPill keeps its own copy, so it reads without a connection.',
        () => void runImport('Importing', 'Imported', (p) => pickAndImportComics(p)),
        () => void runImport('Importing folder', 'Imported', (p) => pickAndImportFolder(p))) },
    { icon: 'cloud-outline', label: 'Link from the cloud', sub: 'Drive, iCloud, Dropbox. Files stay there and download when you open them.', tint: '#3B82F6',
      onPress: () => filesOrFolder('Link from the cloud', 'Nothing is copied now. Each comic downloads the first time you open it, and your cloud app keeps the original.',
        () => void runImport('Linking', 'Linked', (p) => linkWithCovers(() => pickAndLinkComics(p), p)),
        () => void runImport('Linking folder', 'Linked', (p) => linkWithCovers(() => pickAndLinkFolder(p), p))) },
    { icon: 'server-outline', label: 'Connect a comic server', sub: 'Komga, Kavita, Calibre-Web or any OPDS server you run.', onPress: () => router.push('/reader/opds') },
    { icon: 'scan-outline', label: 'Scan your shelf', sub: 'Photograph physical comics to list them in My Collection.', onPress: () => router.push('/scan') },
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
        {recent.length ? (
          <Animated.View entering={FadeInDown.duration(380)}>
            <View style={styles.shelfHead}>
              <Text style={[styles.groupTitle, { color: c.textPrimary, fontFamily: typography.display }]}>On your shelf</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/reader/phone')} hitSlop={8}><Text style={[styles.seeAll, { color: c.primary, fontFamily: typography.bodySemibold }]}>See all</Text></Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
              {recent.map((comic) => (
                <PressableScale key={comic.id} to={0.96} onPress={() => router.push(`/reader/${comic.id}`)} style={styles.shelfItem} accessibilityRole="button" accessibilityLabel={comic.title}>
                  <View style={[styles.shelfCover, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}><Image source={{ uri: comic.coverPath ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} recyclingKey={`hub-${comic.id}`} /></View>
                  <Text numberOfLines={1} style={[styles.shelfTitle, { color: c.textPrimary, fontFamily: typography.bodyMedium }]}>{comic.title}</Text>
                </PressableScale>
              ))}
            </ScrollView>
          </Animated.View>
        ) : null}
        {group('Libraries', 'libraries', libraries, 0)}
        {group('Add comics', 'imports', imports, 80)}
        {group('More', 'tools', tools, 160)}
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: 130 },
  shelfHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 18, marginBottom: 12 },
  seeAll: { fontSize: 14 },
  shelf: { gap: 14, paddingRight: space.lg },
  shelfItem: { width: 122 },
  shelfCover: { width: 122, height: 183, borderRadius: 14, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  shelfTitle: { fontSize: 13, marginTop: 8 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 22, marginBottom: 10, alignSelf: 'flex-start' },
  groupTitle: { fontSize: 22, letterSpacing: -0.4 },
  card: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 62, paddingVertical: 10 },
  rowIcon: { width: 28, alignItems: 'center' },
  rowLabel: { fontSize: 16 },
  rowSub: { fontSize: 12.5, marginTop: 2 },
});
