// Handles comicpill://import?d=<code> — the deep link a shared playlist URL
// (docs/p/index.html) redirects into when ComicPill is already installed.
// Reuses the exact same PILL1 decoder as the in-app "paste a code" import;
// only the transport (a real link, vs. pasting text) is different.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { importSharedPlaylist, type ImportResult } from '../../lib/db/queries/playlists';
import { Button } from '../../ui/primitives';
import { color, font, space, type } from '../../ui/tokens';

export default function ImportPlaylistScreen() {
  const { d } = useLocalSearchParams<{ d?: string }>();
  const [result, setResult] = useState<ImportResult | 'pending' | 'missing'>('pending');

  useEffect(() => {
    if (!d) { setResult('missing'); return; }
    setResult(importSharedPlaylist(decodeURIComponent(d)));
  }, [d]);

  if (result === 'pending') {
    return <View style={styles.page}><Text style={styles.title}>Opening your shared playlist…</Text></View>;
  }
  if (result === 'missing' || !result.playlist) {
    return <View style={styles.page}>
      <Text style={styles.title}>Couldn&apos;t read that link</Text>
      <Text style={styles.copy}>Ask whoever sent it to share the playlist again.</Text>
      <Button style={{ marginTop: space.lg }} onPress={() => router.replace('/playlists')}>Go to Playlists</Button>
    </View>;
  }
  return <View style={styles.page}>
    <Text style={styles.title}>{result.resolvedCount > 0 ? 'Playlist added' : 'Nothing matched yet'}</Text>
    <Text style={styles.copy}>
      {result.resolvedCount > 0
        ? `"${result.playlist.name}" is in your Playlists now — ${result.resolvedCount} comic${result.resolvedCount === 1 ? '' : 's'} matched your catalog.`
        : `"${result.playlist.name}" was added, but none of its comics matched your catalog yet.`}
      {result.unresolvedTitles.length ? ` ${result.unresolvedTitles.length} title${result.unresolvedTitles.length === 1 ? "" : 's'} didn’t match: ${result.unresolvedTitles.join(', ')}.` : ''}
    </Text>
    <Button style={{ marginTop: space.lg }} onPress={() => router.replace('/playlists')}>View Playlist</Button>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  title: { color: color.text, fontFamily: font.display, fontSize: type.title, textAlign: 'center' },
  copy: { color: color.muted, fontFamily: font.body, fontSize: type.body, lineHeight: 22, textAlign: 'center' },
});
