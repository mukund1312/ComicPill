// The engine boundary: plain-object inputs/outputs only.
// Nothing here imports react, react-native, expo, or the db layer.
import type { Dim, EdgeType, ContextLevel, Own, FormatVerdict } from './domain';

export type SweetSpots = Record<Dim, { value: number; confidence: number }>;
export type Affinity = { score: number; seen: number }; // score -1..1

export interface TasteProfile {
  engineVersion: number;
  sweetSpots: SweetSpots;
  affinities: {
    genre: Record<string, Affinity>;
    creator: Record<string, Affinity>;
    character: Record<string, Affinity>;
    bucket: Record<string, Affinity>;
  };
  explorationRate: number; // 0.1..0.5, starts 0.2
  adventurousness: number; // 0..1
  streak: { bucket: string | null; count: number };
  updatedAt: string;
}

export interface ScorableWork {
  id: string;
  title: string;
  bucket: string; // path key
  universe: string;
  fingerprint: Record<Dim, number> | null;
  genres: string[];
  creators: string[];
  characters: string[];
  contextNeeded: 'none' | 'helpful' | 'required';
  requiredParentIds: string[]; // works this one needs read first
  own: Own;
  keeper: boolean;
  pricePaise: number | null;
  formatVerdict: FormatVerdict;
}

export interface ScoreContribution {
  part: 'T' | 'M' | 'P' | 'O' | 'N' | 'F';
  value: number;
  detail: string;
}

export interface ScoreParts {
  T: number; M: number; P: number; O: number; N: number; F: number;
  total: number;
  contributions: ScoreContribution[];
}

export interface StoryEdge {
  fromWork: string;
  toWork: string;
  type: EdgeType;
  confirmed: boolean;
}

export interface FinishedRead {
  workId: string;
  bucket: string;
  fingerprint: Record<Dim, number> | null;
  rating: 1 | 2 | 3 | 4 | 5; // Not for me..Loved it
  finishedAt: string;
}

export interface NotTonight {
  workId: string;
  bucket: string;
  at: string;
}

export interface FatigueState {
  fatigued: boolean;
  triggers: Array<'streak' | 'falling_ratings' | 'repeated_not_tonight' | 'long_gap'>;
}

export interface EngineConfig {
  version: number;
  weights: { T: number; M: number; P: number; O: number; F: number };
  tasteFloorSwitch: number;
  tasteFloorExplore: number;
  explorationBounds: [number, number];
  signalWeights: Record<string, number>;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  version: 1,
  weights: { T: 0.35, M: 0.15, P: 0.20, O: 0.10, F: 0.15 },
  tasteFloorSwitch: 0.6,
  tasteFloorExplore: 0.45,
  explorationBounds: [0.1, 0.5],
  signalWeights: {
    rating_loved: 1.0,
    rating_great: 0.7,
    rating_good: 0.4,
    rating_meh: -0.3,
    rating_not_for_me: -0.8,
    dropped: -1.0,
    chip: 0.5,
    swipe_right: 0.3,
    swipe_left: -0.3,
    swipe_up: 0.7, // multiplier on the mini-rating, not a flat weight
    not_tonight: -0.05,
  },
};

export interface TodayInput {
  works: ScorableWork[];
  edges: StoryEdge[];
  profile: TasteProfile;
  /** Per-bucket path state, used only to distinguish "reading" from "unstarted". */
  pathStatus: Record<string, 'reading' | 'unstarted' | 'not_in_path'>;
  /** The exact next unread work per bucket (from the graph engine's nextInPath),
   *  so P rewards only that one work, never every unread book in the bucket. */
  nextWorkIdByBucket: Record<string, string | null>;
  ownedOnly: boolean;
  recentFinished: FinishedRead[]; // most recent first
  recentNotTonight: NotTonight[];
  excludedWorkIds: Set<string>; // finished, dropped, swiped-left <60d
}

export interface TodayOptions {
  mood: string | null;
  dateKey: string; // YYYY-MM-DD, the daily tie-breaker seed
  config: EngineConfig;
  now: Date; // caller-supplied; engines never read the system clock
}

export interface TodaySlots {
  continueSlot: { workId: string; parts: ScoreParts } | null;
  switchSlot: { workId: string; parts: ScoreParts } | null;
  exploreSlot: { workId: string; parts: ScoreParts } | null;
  lead: 'continue' | 'switch' | 'explore';
  readingNow: string[];
}
