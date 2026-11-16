// "A newer ComicPill is available." Shown only for directly-installed Android
// builds. A required update can't be dismissed; an ordinary one can, and a
// dismissed version stays hidden until an even newer one is published.
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../ui/primitives';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { useUpdate } from '../../lib/update/useUpdate';

export default function UpdateBanner() {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const { status, openDownload, dismiss } = useUpdate();
  if (!status || status.kind === 'up_to_date') return null;
  return (
    <View accessibilityRole="alert" style={[styles.card, { backgroundColor: c.surface, borderColor: c.primary }]}>
      <Text style={[styles.title, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>
        {status.kind === 'required' ? 'Please update ComicPill' : `ComicPill ${status.latest} is available`}
      </Text>
      {status.notes ? <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>{status.notes}</Text> : null}
      <View style={styles.row}>
        <Button style={styles.flex} onPress={openDownload}>Get the update</Button>
        {status.kind === 'available' ? <Button kind="ghost" onPress={dismiss}>Later</Button> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: space.md, gap: 8, marginBottom: space.md },
  title: { fontSize: 16 },
  body: { fontSize: 14, lineHeight: 19 },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  flex: { flex: 1 },
});
