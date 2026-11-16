import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { File, Paths } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import { authHeaders, loadFeed, searchUrl, OpdsError } from '../../lib/opds/client';
import { safeFileName, type OpdsEntry, type OpdsFeed } from '../../lib/opds/parse';
import { listServers } from '../../lib/opds/servers';
import { importLocalFile } from '../../lib/reader/importComics';
import { linkOpdsLibrary } from '../../lib/reader/linkOpds';
import { runJob, useJob } from '../../lib/reader/importJob';
import { SettingsPage } from '../../ui/SettingsPage';
import { Input } from '../../ui/primitives';
import { radius, space, type } from '../../ui/tokens';

import { useThemed, type Palette, type Fonts } from '../../ui/theme';

export default function OpdsBrowseScreen() {
  const { color, styles } = useThemed(makeStyles);
  const { server: serverId, url } = useLocalSearchParams<{ server: string; url: string }>();
  // Looked up once per server id: a new object every render would make the loader below fire in a loop.
  const server = useMemo(() => listServers().find((s) => s.id === serverId), [serverId]);
  const [headers, setHeaders] = useState<Record<string, string>>({});
  useEffect(() => { if (server) void authHeaders(server).then(setHeaders); }, [server]);
  const [feed, setFeed] = useState<OpdsFeed | null>(null);
  const [entries, setEntries] = useState<OpdsEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true); // the first page loads as soon as the screen opens
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Record<string, 'downloading' | 'added' | 'failed'>>({});
  const running = useJob().running;

  // Like Kindle: every comic here appears in My Collection with its cover; a comic is only fetched when it is opened.
  const addAll = () => {
    if (!server) return;
    Alert.alert('Add everything here to My Collection?', 'Every comic in this catalog is added with its cover and name. Nothing is downloaded: a comic comes across when you open it, and only as many as you allow are kept on this device. Series become folders. Adding again only brings in new comics.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Add them', onPress: () => { void runJob('Reading the catalog', async (p) => ({ verb: 'Added', result: await linkOpdsLibrary(server, String(url), p) })).then((started) => { if (!started) Alert.alert('Another import is running', 'Wait for it to finish, or press Stop on the bar at the bottom.'); }); } },
    ]);
  };

  /** Fetch one page. The caller says whether it is the first page of something new or more of the current one. */
  const load = useCallback(async (target: string, append: boolean) => {
    if (!server) return;
    try { const f = await loadFeed(target, server); setFeed(f); setEntries((cur) => (append ? [...cur, ...f.entries] : f.entries)); setError(null); }
    catch (e) { setError(e instanceof OpdsError ? e.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  }, [server]);

  // The first page of whatever this screen was opened on.
  useEffect(() => {
    if (!server) return;
    let live = true;
    (async () => {
      try { const f = await loadFeed(String(url), server); if (live) { setFeed(f); setEntries(f.entries); setError(null); } }
      catch (e) { if (live) setError(e instanceof OpdsError ? e.message : 'Something went wrong.'); }
      finally { if (live) setBusy(false); }
    })();
    return () => { live = false; };
  }, [server, url]);

  const open = (target: string, append = false) => { setBusy(true); return load(target, append); };

  const search = async () => {
    if (!server || !feed || !query.trim()) return;
    setBusy(true);
    try { const target = await searchUrl(feed, String(url), server, query.trim()); if (target) await open(target); else Alert.alert('No search here', 'This catalog doesn’t offer search.'); }
    catch (e) { setError(e instanceof OpdsError ? e.message : 'Search failed.'); setBusy(false); }
  };

  const download = async (entry: OpdsEntry) => {
    const acq = entry.acquisitions[0];
    if (!server || !acq) return;
    setStatus((s) => ({ ...s, [entry.id]: 'downloading' }));
    const dest = new File(Paths.cache, `opds-${entry.id.replace(/\W+/g, '').slice(-40)}.${acq.ext ?? 'cbz'}`);
    try {
      await File.downloadFileAsync(acq.href, dest, { headers: await authHeaders(server), idempotent: true });
      const result = await importLocalFile(dest.uri, safeFileName(entry.title, acq.ext ?? 'cbz'));
      if (result.failed.length) { setStatus((s) => ({ ...s, [entry.id]: 'failed' })); Alert.alert('Downloaded, but couldn’t open it', result.failed[0].reason); }
      else setStatus((s) => ({ ...s, [entry.id]: 'added' }));
    } catch {
      setStatus((s) => ({ ...s, [entry.id]: 'failed' }));
      Alert.alert('Download failed', 'Check your connection and try again.');
    } finally { try { if (dest.exists) dest.delete(); } catch { /* cache file */ } }
  };

  if (!server) return <SettingsPage title="Server not found" subtitle="It may have been removed." />;

  return (
    <SettingsPage title={feed?.title ?? server.name} subtitle={server.url}>
      {feed?.search || feed?.searchDescription ? <View style={{ marginTop: space.md }}><Input placeholder="Search this catalog" value={query} onChangeText={setQuery} /><Pressable onPress={search} style={styles.searchBtn}><Text style={styles.searchText}>Search</Text></Pressable></View> : null}
      <Pressable accessibilityRole="button" disabled={running || busy || !!error} onPress={addAll} style={[styles.searchBtn, (running || busy || !!error) && { opacity: 0.5 }]}><Text style={styles.searchText}>{running ? 'An import is running…' : 'Add everything here to My Collection'}</Text></Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={entries}
        scrollEnabled={false}
        keyExtractor={(e, i) => `${e.id}-${i}`}
        ListEmptyComponent={busy ? <ActivityIndicator color={color.accent} style={{ marginTop: space.xl }} /> : !error ? <Text style={styles.empty}>Nothing here.</Text> : null}
        renderItem={({ item }) => {
          const st = status[item.id];
          const hasFile = item.acquisitions.length > 0;
          return (
            <Pressable accessibilityRole="button" disabled={!item.nav} onPress={() => item.nav && router.push({ pathname: '/reader/opds/browse', params: { server: server.id, url: item.nav } })} style={styles.row}>
              <View style={styles.thumb}>{item.thumb ? <Image transition={180} source={{ uri: item.thumb, headers }} style={styles.fill} contentFit="cover" /> : <Text style={styles.glyph}>{item.nav ? '▤' : '▥'}</Text>}</View>
              <View style={styles.main}>
                <Text numberOfLines={2} style={styles.title}>{item.title}</Text>
                {item.authors.length ? <Text numberOfLines={1} style={styles.sub}>{item.authors.join(', ')}</Text> : null}
                {item.summary && !hasFile ? <Text numberOfLines={2} style={styles.sub}>{item.summary}</Text> : null}
              </View>
              {hasFile ? (
                <Pressable accessibilityRole="button" disabled={st === 'downloading' || st === 'added'} onPress={() => download(item)} style={[styles.dl, st === 'added' && styles.dlDone]}>
                  {st === 'downloading' ? <ActivityIndicator color={color.text} /> : <Text style={styles.dlText}>{st === 'added' ? '✓ Added' : st === 'failed' ? 'Retry' : `Get ${item.acquisitions[0].ext?.toUpperCase() ?? ''}`}</Text>}
                </Pressable>
              ) : item.nav ? <Text style={styles.chev}>›</Text> : null}
            </Pressable>
          );
        }}
      />
      {feed?.next ? <Pressable onPress={() => open(feed.next!, true)} style={styles.more} disabled={busy}><Text style={styles.moreText}>{busy ? 'Loading…' : 'Load more'}</Text></Pressable> : null}
    </SettingsPage>
  );
}

const makeStyles = (color: Palette, font: Fonts) => StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  searchBtn: { alignSelf: 'flex-start', marginTop: space.sm, paddingHorizontal: space.lg, minHeight: 40, justifyContent: 'center', borderRadius: radius.md, backgroundColor: color.accent },
  searchText: { color: color.text, fontFamily: font.bodySemibold, fontSize: type.caption },
  error: { color: color.warning, fontFamily: font.bodyMedium, fontSize: type.caption, marginTop: space.md },
  empty: { color: color.muted, fontFamily: font.body, marginTop: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: color.border },
  thumb: { width: 52, height: 78, borderRadius: radius.sm, backgroundColor: color.surface2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  glyph: { color: color.faint, fontSize: 22 },
  main: { flex: 1, gap: 2 },
  title: { color: color.text, fontFamily: font.displayMedium, fontSize: type.body },
  sub: { color: color.muted, fontFamily: font.body, fontSize: 12 },
  dl: { minWidth: 76, minHeight: 38, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' },
  dlDone: { backgroundColor: color.positive },
  dlText: { color: color.text, fontFamily: font.bodySemibold, fontSize: 12 },
  chev: { color: color.accent, fontSize: 26 },
  more: { alignSelf: 'center', marginTop: space.lg, paddingHorizontal: space.xl, minHeight: 44, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: color.border },
  moreText: { color: color.text, fontFamily: font.bodyMedium },
});
