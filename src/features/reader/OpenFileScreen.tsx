// Landing screen for "Open with ComicPill": copies the incoming file into the library, then opens it.
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../ui/primitives';
import { useAppearance } from '../../ui/theme';
import { space } from '../../ui/tokens';
import * as LegacyFS from 'expo-file-system/legacy';
import { importLocalFile } from '../../lib/reader/importComics';
import { listReaderComics } from '../../lib/reader/readerLibrary';

const nameFromUri = (uri: string) => {
  try { const last = decodeURIComponent(uri.split('?')[0]).split(/[/:]/).filter(Boolean).pop() ?? ''; return last.includes('.') ? last : `${last || 'Comic'}.cbz`; } catch { return 'Comic.cbz'; }
};

export default function OpenFileScreen() {
  const { uri } = useLocalSearchParams<{ uri?: string }>();
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uri) return;
    let live = true;
    (async () => {
      const name = nameFromUri(String(uri));
      const before = new Set(listReaderComics().map((comic) => comic.id));
      // content:// addresses (what other apps hand over) can only be read through the platform's own copy. Android grants access to the
      // address exactly as the sender wrote it, but the router decodes it ("msf%3A51" becomes "msf:51"), so try the original spelling too.
      const raw = String(uri);
      const reEncoded = raw.replace(/(\/(?:document|tree)\/)([^?#]*)$/, (_m, head: string, id: string) => head + encodeURIComponent(decodeURIComponent(id)));
      const staged = `${LegacyFS.cacheDirectory}incoming-${Date.now()}-${name.replace(/[^\w.-]+/g, '_')}`;
      let copied = false; let lastError: unknown = null;
      for (const candidate of [...new Set([reEncoded, raw])]) {
        try { await LegacyFS.copyAsync({ from: candidate, to: staged }); copied = true; break; } catch (e) { lastError = e; }
      }
      if (!copied) throw lastError ?? new Error('copy failed');
      const result = await importLocalFile(staged, name);
      try { await LegacyFS.deleteAsync(staged, { idempotent: true }); } catch { /* cache is cleaned by the system anyway */ }
      if (!live) return;
      const added = listReaderComics().find((comic) => !before.has(comic.id));
      if (added) router.replace(`/reader/${added.id}`);
      else setError(result.failed[0]?.reason ?? 'This file could not be opened.');
    })().catch((e) => { console.warn('open-file failed', String(e).slice(0, 120)); if (live) setError('This file could not be opened.'); });
    return () => { live = false; };
  }, [uri]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
      <View style={styles.center}>
        {error ? (
          <>
            <Text style={[styles.title, { color: c.textPrimary, fontFamily: typography.display }]}>Couldn’t open that file</Text>
            <Text style={[styles.copy, { color: c.textSecondary, fontFamily: typography.body }]}>{error}</Text>
            <View style={{ alignSelf: 'stretch', marginTop: space.lg }}><Button onPress={() => router.replace('/library')}>Go to my library</Button></View>
          </>
        ) : (
          <>
            <ActivityIndicator color={c.primary} />
            <Text style={[styles.copy, { color: c.textSecondary, fontFamily: typography.body }]}>Adding to ComicPill…</Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { fontSize: 24, textAlign: 'center' },
  copy: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
});
