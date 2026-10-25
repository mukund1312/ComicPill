import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { DEFAULT_PROFILE, sanitizeProfile, validateProfile, type UserProfile } from '../settings/profileModel';

export const PROFILE_KEY = '@comicpill/profile/v1';

export interface ProfileState extends UserProfile {
  /** Save an edited profile. Returns false (and changes nothing) if it isn't valid. */
  save: (next: UserProfile) => boolean;
  reset: () => void;
}

const fields = (s: UserProfile): UserProfile => ({
  displayName: s.displayName, username: s.username, bio: s.bio, avatar: s.avatar, monthlyGoal: s.monthlyGoal,
});

export function createProfileStore(storage: StateStorage) {
  return create<ProfileState>()(persist(
    (set) => ({
      ...DEFAULT_PROFILE,
      save: (next) => {
        const v = validateProfile(next);
        if (!v.ok) return false;
        set(v.value);
        return true;
      },
      reset: () => set({ ...DEFAULT_PROFILE }),
    }),
    {
      name: PROFILE_KEY,
      version: 1,
      storage: createJSONStorage(() => storage),
      partialize: (s) => fields(s),
      merge: (persisted, current) => ({ ...current, ...sanitizeProfile(persisted) }),
    },
  ));
}
