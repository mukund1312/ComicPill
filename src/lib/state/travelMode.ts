// Travel mode is a global, app-wide context — not scoped to Today alone.
// When on, both Today's recommendations AND Library's grid narrow to what's
// actually reachable right now (digitally accessible), not the whole shelf.
import { create } from 'zustand';

interface TravelModeState {
  digitalOnly: boolean;
  setDigitalOnly: (value: boolean) => void;
}

export const useTravelMode = create<TravelModeState>((set) => ({
  digitalOnly: false,
  setDigitalOnly: (value) => set({ digitalOnly: value }),
}));
