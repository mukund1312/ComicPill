// The taste-engine blueprint's worked example, turned into fixture data.
// See docs: "A hypothetical two weeks using your library" — Dark Victory through
// Fantastic Four: Solve Everything.
import type { Dim } from '../../../types/domain';
import type { ScorableWork, StoryEdge, TodayInput } from '../../../types/engine-io';
import { emptyProfile } from '../../taste/profile';

function fp(partial: Partial<Record<Dim, number>>): Record<Dim, number> {
  const base: Record<Dim, number> = {
    tone: 0.5, violence: 0.5, scale: 0.3, complexity: 0.4,
    mystery: 0.3, pace: 0.5, artForward: 0.5, commitment: 0.3,
  };
  return { ...base, ...partial };
}

function work(w: Partial<ScorableWork> & { id: string; bucket: string }): ScorableWork {
  return {
    title: w.id, universe: 'main', fingerprint: null, genres: [], creators: [], characters: [],
    contextNeeded: 'none', requiredParentIds: [], own: 'physical', keeper: false,
    pricePaise: null, formatVerdict: 'digital',
    ...w,
  };
}

export const darkVictory = work({
  id: 'dark-victory', bucket: 'batman',
  fingerprint: fp({ tone: 0.55, mystery: 0.85, violence: 0.65, artForward: 0.6 }),
  genres: ['detective', 'mystery', 'crime'], creators: ['Tim Sale'], characters: ['Two-Face'],
  keeper: true,
});
export const underRedHood = work({
  id: 'under-red-hood', bucket: 'batman',
  fingerprint: fp({ tone: 0.55, mystery: 0.5, violence: 0.55, pace: 0.6 }),
  genres: ['detective', 'crime'], creators: ['Judd Winick'], characters: ['Jason Todd'],
});
export const blackMirror = work({
  id: 'black-mirror', bucket: 'batman',
  fingerprint: fp({ tone: 0.7, mystery: 0.75, violence: 0.6, artForward: 0.7 }),
  genres: ['detective', 'mystery', 'horror'], creators: ['Jock'], characters: ['Dick Grayson'],
  keeper: true,
});
export const theCult = work({
  id: 'the-cult', bucket: 'batman',
  fingerprint: fp({ tone: 0.75, mystery: 0.4, violence: 0.7 }),
  genres: ['horror', 'crime'], creators: [], characters: [],
});
export const manWithoutFear = work({
  id: 'man-without-fear', bucket: 'street',
  fingerprint: fp({ tone: 0.6, mystery: 0.3, violence: 0.6, artForward: 0.6 }),
  genres: ['crime', 'street_level'], creators: [], characters: ['Daredevil'],
});
export const bornAgain = work({
  id: 'born-again', bucket: 'street',
  fingerprint: fp({ tone: 0.7, mystery: 0.3, violence: 0.5, complexity: 0.6, pace: 0.35, artForward: 0.35 }),
  // No genre overlap with Dark Victory's own tags — the point of this fixture is
  // to show BUCKET affinity (not genre affinity) rising once Man Without Fear,
  // its own bucket-mate, is finished.
  genres: ['street_level'], creators: [], characters: ['Daredevil'],
  keeper: true,
  // Real reading order: Born Again follows Man Without Fear, so it stays out of
  // contention until that parent is finished.
  contextNeeded: 'required', requiredParentIds: ['man-without-fear'],
});
export const siktc = work({
  id: 'siktc', bucket: 'dark',
  fingerprint: fp({ tone: 0.8, mystery: 0.8, violence: 0.65, pace: 0.55 }),
  genres: ['horror', 'mystery'], creators: [], characters: [],
});
export const ffSolve = work({
  id: 'ff-solve', bucket: 'marvelcosmic',
  // Fully specified on purpose (not relying on fp()'s shared defaults): a
  // cosmic, reality-bending, widescreen-art one-shot reads as genuinely
  // distant from a grounded Batman street-crime book on every axis, which is
  // exactly why it's a good Explore pick later on and shouldn't look
  // artificially 'similar to recent reads' just from sharing unset defaults.
  fingerprint: fp({ tone: 0.35, scale: 0.9, mystery: 0.5, violence: 0.3, complexity: 0.7, pace: 0.4, artForward: 0.7, commitment: 0.5 }),
  genres: ['cosmic', 'sci-fi', 'mystery'], creators: [], characters: [],
  keeper: true,
});
// Deliberately low-violence, hopeful filler so it never coincidentally out-scores
// the narrative's intended picks on the one calibrated dimension alone.
export const heroicFiller = work({
  id: 'heroic-filler', bucket: 'heroic',
  fingerprint: fp({ tone: 0.15, scale: 0.6, violence: 0.1, mystery: 0.1 }),
  genres: ['heroic'], creators: [], characters: [],
});
export const cosmicFiller = work({
  id: 'cosmic-filler', bucket: 'dccosmic',
  fingerprint: fp({ tone: 0.25, scale: 0.95, violence: 0.1, mystery: 0.15 }),
  genres: ['cosmic'], creators: [], characters: [],
});

export const ALL_WORKS: ScorableWork[] = [
  darkVictory, underRedHood, blackMirror, theCult,
  manWithoutFear, bornAgain, siktc, ffSolve, heroicFiller, cosmicFiller,
];
export const WORKS_BY_ID = new Map(ALL_WORKS.map((w) => [w.id, w]));

export const EDGES: StoryEdge[] = [
  { fromWork: darkVictory.id, toWork: underRedHood.id, type: 'same_run', strength: 'strongly_recommended', confirmed: true },
  { fromWork: underRedHood.id, toWork: blackMirror.id, type: 'same_run', strength: 'strongly_recommended', confirmed: true },
  { fromWork: blackMirror.id, toWork: theCult.id, type: 'same_run', strength: 'strongly_recommended', confirmed: true },
  { fromWork: manWithoutFear.id, toWork: bornAgain.id, type: 'direct_sequel', strength: 'required', confirmed: true },
];

const DATE_KEY = '2026-09-01';

export function buildInput(overrides: Partial<TodayInput> = {}): TodayInput {
  return {
    works: ALL_WORKS,
    edges: EDGES,
    profile: emptyProfile(),
    pathStatus: {
      batman: 'reading', street: 'unstarted', dark: 'unstarted',
      marvelcosmic: 'unstarted', heroic: 'unstarted', dccosmic: 'unstarted',
    },
    nextWorkIdByBucket: {
      batman: underRedHood.id, street: manWithoutFear.id, dark: siktc.id,
      marvelcosmic: ffSolve.id, heroic: heroicFiller.id, dccosmic: cosmicFiller.id,
    },
    ownedOnly: false,
    formatFilter: 'any',
    recentFinished: [],
    recentNotTonight: [],
    excludedWorkIds: new Set(),
    ...overrides,
  };
}

export { DATE_KEY };
