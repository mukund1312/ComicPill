import { useEffect } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import TodayScreen from '../src/features/today/TodayScreen';
import { useOnboarding, useOnboardingReady } from '../src/lib/state/onboarding';
import { useAuth } from '../src/lib/auth/auth';
import { useAppearance } from '../src/ui/theme';

/** The front door. An account is optional: with none, the app opens straight in (onboarding first, then Today). Someone who made an
 *  account and signed out is asked to sign in. Blank frames while saved state is read, so nobody flashes into the wrong screen. */
export default function Index() {
  const ready = useOnboardingReady();
  const completed = useOnboarding((s) => s.completed);
  const status = useAuth((s) => s.status);
  const hasAccount = useAuth((s) => s.hasAccount);
  const load = useAuth((s) => s.load);
  const { theme } = useAppearance();
  useEffect(() => { void load(); }, [load]);

  if (!ready || status === 'loading') return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  if (status === 'signedOut' && hasAccount) return <Redirect href="/sign-in" />;
  if (!completed) return <Redirect href="/onboarding" />;
  return <TodayScreen />;
}
