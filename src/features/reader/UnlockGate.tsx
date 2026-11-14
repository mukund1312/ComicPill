import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { checkPassword, markUnlocked } from '../../lib/reader/lock';
import { sha256 } from '../../lib/reader/lockCrypto';
import { getLock } from '../../lib/reader/readerLibrary';
import { Button } from '../../ui/primitives';
import { biometricName, biometricsOn, confirmWithBiometrics } from '../../lib/platform/biometrics';
import { feedback } from '../../lib/platform/feedback';
import { color, font, radius, space, type } from '../../ui/tokens';

/** In the way of a locked comic (or one in a locked folder), however the reader got here — shelf, link or Mind Space. */
export function UnlockGate({ kind, id, name, onUnlocked }: { kind: 'comic' | 'folder'; id: string; name: string; onUnlocked: () => void }) {
  const [pw, setPw] = useState(''); const [wrong, setWrong] = useState(false); const [busy, setBusy] = useState(false);
  const [bio, setBio] = useState<string | null>(null); // the fingerprint button's name, once we know the phone has one
  const tryBiometrics = useCallback(async () => {
    if (await confirmWithBiometrics(`“${name}”`)) { feedback.success(); markUnlocked(kind, id); onUnlocked(); }
  }, [kind, id, name, onUnlocked]);
  // Offered straight away when there is a fingerprint; the password field stays underneath for "Use password".
  useEffect(() => {
    let live = true;
    void (async () => { if (await biometricsOn()) { const n = await biometricName(); if (!live) return; setBio(n); void tryBiometrics(); } })();
    return () => { live = false; };
  }, [tryBiometrics]);
  const submit = async () => {
    setBusy(true);
    try {
      const lock = getLock(kind, id);
      if (lock && (await checkPassword(pw, lock, sha256))) { markUnlocked(kind, id); onUnlocked(); } else { setWrong(true); setPw(''); }
    } finally { setBusy(false); }
  };
  return (
    <View style={styles.root}>
      <Text style={styles.lock}>🔒</Text>
      <Text style={styles.title}>{kind === 'folder' ? 'This folder is locked' : 'This comic is locked'}</Text>
      <Text style={styles.sub}>{name}</Text>
      <TextInput secureTextEntry value={pw} onChangeText={(t) => { setPw(t); setWrong(false); }} onSubmitEditing={submit} placeholder="Password" placeholderTextColor={color.faint} style={[styles.input, wrong && styles.inputWrong]} autoCapitalize="none" autoCorrect={false} returnKeyType="go" />
      {wrong ? <Text style={styles.wrong}>Wrong password. Try again.</Text> : null}
      <View style={styles.buttons}><Button onPress={submit} disabled={busy || !pw}>Unlock</Button>{bio ? <Button kind="secondary" onPress={() => { void tryBiometrics(); }}>{`Use ${bio}`}</Button> : null}<Button kind="ghost" onPress={() => router.back()}>Back</Button></View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md },
  lock: { fontSize: 44 },
  title: { color: color.text, fontFamily: font.displayMedium, fontSize: type.title },
  sub: { color: color.muted, fontFamily: font.body, fontSize: type.body, textAlign: 'center' },
  input: { width: '100%', maxWidth: 360, minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, color: color.text, paddingHorizontal: space.md, fontFamily: font.body, fontSize: type.body },
  inputWrong: { borderColor: color.accent },
  wrong: { color: color.accent, fontFamily: font.bodyMedium, fontSize: type.caption },
  buttons: { width: '100%', maxWidth: 360, gap: space.sm, marginTop: space.sm },
});
