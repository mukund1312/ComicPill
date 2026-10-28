// First run: how much of the device downloaded comics may use. The whole collection can be far bigger; only this much is kept here for
// offline reading, and everything else shows its cover and downloads when it is opened.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Paths } from 'expo-file-system';
import { StageFrame } from './StageFrame';
import { Pill } from '../../ui/primitives';
import { useAppearance } from '../../ui/theme';
import { space } from '../../ui/tokens';
import { deviceName } from '../../lib/platform/device';
import { formatBytes } from '../../lib/reader/bytes';
import { BUDGET_CHOICES_GB, cloudBudgetGb, setCloudBudgetGb } from '../../lib/reader/cloudBudget';

export function StorageStage({ onNext }: { onNext: () => void }) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const [gb, setGb] = useState(() => cloudBudgetGb());
  const device = `this ${deviceName()}`;
  return (
    <StageFrame
      title="How much space for offline comics?"
      subtitle={`Your whole collection can be as big as you like. Only this much of ${device} is kept for reading offline. The rest shows its cover and downloads when you open it.`}
      primaryLabel="Continue" onPrimary={() => { setCloudBudgetGb(gb); onNext(); }}
      onSkip={onNext} skipLabel="Use 10 GB"
    >
      <View style={styles.pills}>
        {BUDGET_CHOICES_GB.map((n) => <Pill key={n} label={`${n} GB`} active={gb === n} onPress={() => setGb(n)} />)}
      </View>
      <Text style={[styles.note, { color: c.textMuted, fontFamily: typography.body }]}>{`Free on ${device} now: ${formatBytes(Paths.availableDiskSpace)}. You can change this any time in Settings → Storage.`}</Text>
    </StageFrame>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  note: { fontSize: 13, lineHeight: 19, marginTop: space.lg },
});
