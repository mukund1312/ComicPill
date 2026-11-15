// First run: offer a hidden shelf. Yes asks for a password right here; Not now moves on (it can be set up later in Settings → Hidden shelf).
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StageFrame } from './StageFrame';
import { TextField } from '../../ui/settingsUi';
import { useAppearance } from '../../ui/theme';
import { space } from '../../ui/tokens';
import { Icon } from '../../ui/Icon';
import { feedback } from '../../lib/platform/feedback';
import { onMyDevice } from '../../lib/platform/device';
import { hiddenShelfReady, markHiddenShelfAsked, newPasswordProblem, setHiddenShelfBiometrics, setUpHiddenShelf } from '../../lib/reader/hiddenShelf';
import { askToUseBiometrics } from '../../lib/platform/biometrics';

export function HiddenShelfStage({ onNext }: { onNext: () => void }) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const [wants, setWants] = useState(false);
  const [pw, setPw] = useState(''); const [again, setAgain] = useState('');
  const [error, setError] = useState<string | undefined>();
  const skip = () => { markHiddenShelfAsked(); onNext(); };

  // Already set up (a relaunch landed back here): nothing to ask.
  if (hiddenShelfReady()) {
    return <StageFrame title="Your hidden shelf is ready." subtitle={`Swipe ${onMyDevice()} from right to left to open it.`} primaryLabel="Continue" onPrimary={onNext} />;
  }

  if (!wants) {
    return (
      <StageFrame
        title="Want a hidden shelf?"
        subtitle={`Some comics are just for you. A hidden shelf keeps them off your shelf, folders, Reading now and search, behind a password of its own.`}
        primaryLabel="Yes, set it up" onPrimary={() => { feedback.tap(); setWants(true); }}
        onSkip={skip} skipLabel="Not now"
      >
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Icon name="eye-off-outline" size={28} color={c.primary} />
          <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>{`To open it later, swipe ${onMyDevice()} from right to left, then type the password. You can set it up or change it any time in Settings → Hidden shelf.`}</Text>
        </View>
      </StageFrame>
    );
  }

  const create = async () => {
    const problem = newPasswordProblem(pw, again);
    if (problem) { feedback.warning(); setError(problem); return; }
    await setUpHiddenShelf(pw);
    setHiddenShelfBiometrics(await askToUseBiometrics('the hidden shelf'));
    feedback.success(); onNext();
  };
  return (
    <StageFrame
      title="Choose a password"
      subtitle="At least 4 characters. It can’t be recovered if you forget it: starting over deletes the hidden comics."
      primaryLabel="Create hidden shelf" onPrimary={() => { void create(); }} primaryDisabled={!pw || !again}
      onSkip={skip} skipLabel="Not now"
    >
      <View style={styles.form}>
        <TextField label="Password" value={pw} onChangeText={(t) => { setPw(t); setError(undefined); }} secure autoCapitalize="none" autoCorrect={false} />
        <TextField label="Type it again" value={again} onChangeText={(t) => { setAgain(t); setError(undefined); }} secure autoCapitalize="none" autoCorrect={false} error={error} />
      </View>
    </StageFrame>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', borderWidth: 1, borderRadius: 16, padding: space.lg, marginTop: space.md },
  body: { flex: 1, fontSize: 14, lineHeight: 21 },
  form: { gap: space.md, marginTop: space.md },
});
