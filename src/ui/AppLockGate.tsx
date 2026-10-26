// Covers the whole app with a passcode prompt while the app lock is on and engaged.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Wordmark } from './primitives';
import { Icon } from './Icon';
import { useAppearance } from './theme';
import { space } from './tokens';
import { startAppLock, useAppLock } from '../lib/applock/appLock';

export function AppLockGate() {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const locked = useAppLock((s) => s.locked); const ready = useAppLock((s) => s.ready); const unlock = useAppLock((s) => s.unlock);
  const [text, setText] = useState(''); const [wrong, setWrong] = useState(false);
  const input = useRef<TextInput>(null);
  useEffect(() => { startAppLock(); }, []);
  // Hide the app until we know whether it is locked, so a locked app never flashes its contents.
  if (!ready) return <View pointerEvents="auto" style={[StyleSheet.absoluteFill, { backgroundColor: c.background, zIndex: 1000 }]} />;
  if (!locked) return null;
  const submit = async () => { const ok = await unlock(text); setWrong(!ok); setText(''); if (!ok) setTimeout(() => input.current?.focus(), 50); };
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(220)} style={[StyleSheet.absoluteFill, { backgroundColor: c.background, zIndex: 1000 }]}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <View style={[styles.badge, { backgroundColor: c.primaryMuted }]}><Icon name="lock-closed" size={30} color={c.primary} /></View>
          <Wordmark />
          <Text style={[styles.copy, { color: c.textSecondary, fontFamily: typography.body }]}>Enter your passcode to open ComicPill.</Text>
          <TextInput ref={input} blurOnSubmit={false} accessibilityLabel="Passcode" value={text} onChangeText={(t) => { setText(t); setWrong(false); }} secureTextEntry autoFocus autoCapitalize="none" autoCorrect={false} onSubmitEditing={submit}
            placeholder="Passcode" placeholderTextColor={c.textMuted} style={[styles.input, { backgroundColor: c.surfaceRaised, color: c.textPrimary, fontFamily: typography.body }]} />
          {wrong ? <Text style={[styles.wrong, { color: c.destructive, fontFamily: typography.bodyMedium }]}>That isn’t right. Try again.</Text> : null}
          <View style={{ alignSelf: 'stretch', marginTop: space.lg }}><Button onPress={submit} disabled={!text}>Unlock</Button></View>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  badge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  copy: { fontSize: 15, textAlign: 'center' },
  input: { alignSelf: 'stretch', height: 54, borderRadius: 16, paddingHorizontal: 16, fontSize: 18, textAlign: 'center', marginTop: 6 },
  wrong: { fontSize: 13 },
});
