// Travel mode is a global, app-wide context — not scoped to Today alone.
// When on, both Today's recommendations AND Library's grid narrow to what's
// actually reachable right now (digitally accessible), not the whole shelf.
// It is remembered between launches (it's a setting, not a session flag).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface TravelModeState {
  digitalOnly: boolean;
  setDigitalOnly: (value: boolean) => void;
}

export const useTravelMode = create<TravelModeState>()(persist(
  (set) => ({
    digitalOnly: false,
    setDigitalOnly: (value) => set({ digitalOnly: value }),
  }),
  {
    name: '@comicpill/travel-mode/v1',
    version: 1,
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (s) => ({ digitalOnly: s.digitalOnly }),
    // Storage is untrusted: anything that isn't a real boolean means "off".
    merge: (persisted, current) => ({ ...current, digitalOnly: (persisted as { digitalOnly?: unknown } | null)?.digitalOnly === true }),
  },
));
