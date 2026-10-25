import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { createOnboardingStore } from './onboardingStore';

/** First-run and taste-setup progress, persisted on this device. */
export const useOnboarding = createOnboardingStore(AsyncStorage);

const subscribe = (notify: () => void) => useOnboarding.persist.onFinishHydration(notify);
const snapshot = () => useOnboarding.persist.hasHydrated();

/** True once saved progress has been read back. Gate redirects on this, or a
 *  returning reader flashes into onboarding for a frame. */
export function useOnboardingReady(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
