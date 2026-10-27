// Where the tablet menu lives (left or right edge) and whether it is showing right now. Persisted on this device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type SidebarState = {
  /** The right edge is the default: it sits under the thumb when you hold a tablet in landscape. */
  side: 'left' | 'right';
  open: boolean;
  setSide: (side: 'left' | 'right') => void;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

export const useSidebar = create<SidebarState>()(persist(
  (set) => ({
    side: 'right', open: true,
    setSide: (side) => set({ side }),
    setOpen: (open) => set({ open }),
    toggle: () => set((s) => ({ open: !s.open })),
  }),
  { name: 'comicpill.sidebar.v1', storage: createJSONStorage(() => AsyncStorage) },
));
