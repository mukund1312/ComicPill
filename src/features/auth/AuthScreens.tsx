// Sign in / sign up / forgot password, by email. The account lives on this phone
// (see lib/auth/model) — the screens say so plainly rather than imply a cloud.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CenteredCard } from '../../ui/CenteredCard';
import { useLayout } from '../../ui/layout';
import { Button, Wordmark } from '../../ui/primitives';
import { TextField } from '../../ui/settingsUi';
import { confirm } from '../../ui/dialogs';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { useAuth } from '../../lib/auth/auth';
import { validateEmail, validatePassword } from '../../lib/auth/model';
import { useOnboarding } from '../../lib/state/onboarding';
import { useProfile } from '../../lib/state/settings';
import { startFreshAccount } from '../../lib/db/queries/freshStart';
import { notice } from '../../ui/dialogs';

type Kind = 'sign-in' | 'sign-up' | 'forgot-password';

const COPY: Record<Kind, { title: string; sub: string }> = {
  'sign-in': { title: 'Welcome back.', sub: 'Sign in to pick up where you left off.' },
  'sign-up': { title: 'Create an account.', sub: 'Optional. ComicPill then asks for your email and password when it opens, so your shelf is yours on a shared phone.' },
  'forgot-password': { title: 'Forgot your password?', sub: '' },
};

export default function AuthScreen({ kind }: { kind: Kind }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const auth = useAuth();
  const signedIn = auth.status === 'signedIn';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const emailError = touched ? validateEmail(email) : null;
  const pwError = touched && kind === 'sign-up' ? validatePassword(password) : null;
  const matchError = touched && kind === 'sign-up' && confirmPw !== password ? 'The passwords don’t match.' : null;

  const submit = async () => {
    setTouched(true);
    setError(null);
    if (validateEmail(email) || (kind === 'sign-up' && (validatePassword(password) || confirmPw !== password))) return;
    setBusy(true);
    try {
      let r = kind === 'sign-up' ? await auth.signUp(email, password) : await auth.signIn(email, password);
      if (!r.ok && r.replaces) {
        const yes = await confirm({
          title: 'Replace the account on this phone?',
          message: `${r.replaces} is signed up here. Creating a new account replaces it and starts a fresh, empty shelf. To keep that account, cancel and sign in instead.`,
          confirmLabel: 'Replace it', destructive: true, cancelLabel: 'Cancel',
        });
        if (!yes) { setBusy(false); return; }
        r = await auth.signUp(email, password, true);
      }
      if (r.ok) {
        if (r.fresh) {
          try {
            startFreshAccount(new Date());
            useProfile.getState().reset();
          } catch {
            notice('Couldn’t reset your shelf', 'Your account was made, but the old library is still here. You can clear it in Settings.');
          }
          useOnboarding.getState().reset();
        }
        router.replace('/');
      }
      else setError(r.message);
    } finally {
      setBusy(false);
    }
  };

  const removeAccount = async () => {
    const yes = await confirm({
      title: 'Remove the account on this phone?',
      message: 'ComicPill can’t email a reset link, so this is the way back in. You keep using the app without an account; your library and taste stay. You can make a new account later in Settings.',
      confirmLabel: 'Remove account', destructive: true,
    });
    if (!yes) return;
    await auth.removeAccount(true);
    router.replace('/');
  };

  const { isTablet } = useLayout();
  // Already in? These screens are never a place to be — go on to the app.
  if (signedIn && !busy) return <Redirect href="/" />;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
      <CenteredCard maxWidth={560}>
      <KeyboardAvoidingView style={[styles.flex, isTablet && { flex: 0 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Wordmark />
          <Text accessibilityRole="header" style={[styles.title, { color: c.textPrimary, fontFamily: typography.display }]}>{COPY[kind].title}</Text>
          {COPY[kind].sub ? <Text style={[styles.sub, { color: c.textSecondary, fontFamily: typography.body }]}>{COPY[kind].sub}</Text> : null}

          {kind === 'forgot-password' ? (
            <View style={styles.form}>
              <Text style={[styles.sub, { color: c.textSecondary, fontFamily: typography.body }]}>
                Your account is stored only on this phone, so there’s no server to email a reset link. If you can’t remember the password, remove the account here. Your comics and taste stay, and you carry on without an account; you can make a new one any time in Settings.
              </Text>
              {auth.hasAccount ? <Button kind="destructive" onPress={removeAccount}>Remove account on this phone</Button> : <Button onPress={() => router.replace('/')}>Continue</Button>}
              <Button kind="ghost" onPress={() => router.replace('/sign-in')}>Back to sign in</Button>
            </View>
          ) : (
            <View style={styles.form}>
              <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} placeholder="you@example.com" error={emailError ?? undefined} />
              <TextField label="Password" value={password} onChangeText={setPassword} secure autoCapitalize="none" autoCorrect={false} error={pwError ?? undefined} hint={kind === 'sign-up' ? 'At least 8 characters.' : undefined} />
              {kind === 'sign-up' ? <TextField label="Confirm password" value={confirmPw} onChangeText={setConfirmPw} secure autoCapitalize="none" autoCorrect={false} error={matchError ?? undefined} /> : null}
              {error ? <Text accessibilityLiveRegion="polite" style={[styles.error, { color: c.error, fontFamily: typography.bodyMedium }]}>{error}</Text> : null}
              <Button onPress={submit} disabled={busy}>{busy ? 'One moment…' : kind === 'sign-up' ? 'Create account' : 'Sign in'}</Button>
              {kind === 'sign-in' ? <Button kind="ghost" onPress={() => router.push('/forgot-password')}>Forgot password?</Button> : null}
              {kind === 'sign-in' || auth.hasAccount ? (
                <Button kind="ghost" onPress={() => router.replace(kind === 'sign-in' ? '/sign-up' : '/sign-in')}>
                  {kind === 'sign-in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
                </Button>
              ) : (
                // No account yet: this page is a choice, never a gate.
                <Button kind="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>Not now</Button>
              )}
              <Text style={[styles.fine, { color: c.textMuted, fontFamily: typography.body }]}>Your account stays on this phone. ComicPill doesn’t send your email or password anywhere.</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      </CenteredCard>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: space.xl, paddingTop: space.xl, gap: space.md, width: '100%', alignSelf: 'center' },
  title: { fontSize: 34, lineHeight: 40, marginTop: space.lg },
  sub: { fontSize: 16, lineHeight: 22 },
  form: { gap: space.md, marginTop: space.lg },
  error: { fontSize: 14 },
  fine: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
