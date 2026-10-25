// Onboarding progress, persisted so a relaunch resumes exactly where the reader
// left off. Injectable storage keeps it testable (see ./onboarding.ts for the app instance).
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { INITIAL_ONBOARDING, nextStageFor, prevStageFor, sanitizeOnboarding, type OnboardingState, type PickKey, type Stage } from '../onboarding/flow';
import { EMPTY_SELECTIONS, type Familiarity } from '../onboarding/taste';
import type { DraftItem } from '../onboarding/collectionDraft';

export const ONBOARDING_KEY = '@comicpill/onboarding/v1';

export interface OnboardingStore extends OnboardingState {
  /** Start (or restart) picking. `editing` = redo the picks from Profile without the tour. */
  begin: (editing?: boolean) => void;
  toggle: (key: PickKey, id: string) => void;
  setFamiliarity: (f: Familiarity) => void;
  next: () => void;
  back: () => void;
  goTo: (stage: Stage) => void;
  markTasteSetup: () => void;
  markCollectionSetup: () => void;
  /** Back to the very first screen, with nothing picked (a new person on this phone). */
  reset: () => void;
  setDraft: (draft: DraftItem[]) => void;
  finish: () => void;
}

const data = (s: OnboardingStore): OnboardingState => ({
  stage: s.stage, completed: s.completed, tasteSetupCompleted: s.tasteSetupCompleted,
  collectionSetupCompleted: s.collectionSetupCompleted, editing: s.editing, selections: s.selections, draft: s.draft, seed: s.seed,
});

export function createOnboardingStore(storage: StateStorage) {
  return create<OnboardingStore>()(persist(
    (set, get) => ({
      ...INITIAL_ONBOARDING,
      begin: (editing = false) => set((s) => ({
        editing, completed: editing ? s.completed : false, stage: editing ? 'characters' : 'welcome',
        seed: (Date.now() % 100000) + 1, // a fresh exploration mix each run, stable within it
      })),
      toggle: (key, id) => set((s) => {
        const cur = s.selections[key];
        const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
        return { selections: { ...s.selections, [key]: next } };
      }),
      setFamiliarity: (familiarity) => set((s) => ({ selections: { ...s.selections, familiarity } })),
      next: () => set((s) => ({ stage: nextStageFor(s.stage, s.editing, s.selections.familiarity) })),
      back: () => set((s) => ({ stage: prevStageFor(s.stage, s.editing, s.selections.familiarity) ?? s.stage })),
      goTo: (stage) => set({ stage }),
      markTasteSetup: () => set({ tasteSetupCompleted: true }),
      markCollectionSetup: () => set({ collectionSetupCompleted: true }),
      reset: () => set({ ...INITIAL_ONBOARDING, seed: (Date.now() % 100000) + 1 }),
      setDraft: (draft) => set({ draft }),
      finish: () => set({ completed: true, stage: 'done', editing: false }),
    }),
    {
      name: ONBOARDING_KEY,
      version: 1,
      storage: createJSONStorage(() => storage),
      partialize: (s) => data(s as OnboardingStore),
      merge: (persisted, current) => ({ ...current, ...sanitizeOnboarding(persisted) }),
    },
  ));
}

export { EMPTY_SELECTIONS };
