// The settings store, built around an injectable storage so it can be tested
// with a fake and used with AsyncStorage in the app (see ./settings.ts).
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { DEFAULT_SETTINGS, pickSettings, sanitizeSettings, type AppSettings } from '../settings/model';

export const SETTINGS_KEY = '@comicpill/settings/v1';

export interface SettingsState extends AppSettings {
  /** Merge a change in; anything invalid is clamped or ignored. */
  update: (patch: Partial<AppSettings>) => void;
  reset: () => void;
}

export function createSettingsStore(storage: StateStorage) {
  return create<SettingsState>()(persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(sanitizeSettings({ ...pickSettings(get()), ...patch })),
      reset: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: SETTINGS_KEY,
      version: 1,
      storage: createJSONStorage(() => storage),
      partialize: (s) => pickSettings(s),
      // Storage may hold anything (older builds, corruption): re-validate it.
      merge: (persisted, current) => ({ ...current, ...sanitizeSettings(persisted) }),
    },
  ));
}
