// Domain types shared across the DB layer, engines, and UI.
// Engines only ever see the "engine-io" subset — see engine-io.ts.

export type Dim =
  | 'tone' | 'violence' | 'scale' | 'complexity'
  | 'mystery' | 'pace' | 'artForward' | 'commitment';

export const DIMENSIONS: Dim[] = [
  'tone', 'violence', 'scale', 'complexity', 'mystery', 'pace', 'artForward', 'commitment',
];

export type Fingerprint = Record<Dim, number>; // each 0..1

export type Own = 'physical' | 'digital' | 'both' | 'none';
export type ReadStatus = 'none' | 'reading' | 'done' | 'dropped';
export type FormatVerdict = 'physical' | 'digital';
export type ContextNeeded = 'none' | 'helpful' | 'required';
export type ContextLevel = 'simple' | 'recommended' | 'completionist';
export type Universe = 'main' | 'alternate' | 'standalone';

export type EdgeType =
  | 'direct_sequel' | 'required_context' | 'optional_context'
  | 'same_run' | 'same_event' | 'alternate_universe' | 'similar_tone';

export interface Work {
  id: string;
  title: string;
  sortTitle: string;
  matchKey: string;
  publisher: string | null;
  universe: Universe;
  fingerprint: Fingerprint | null;
  genres: string[];
  creators: string[];
  characters: string[];
  keeperFlag: boolean;
  contextNeeded: ContextNeeded;
  summary: string | null;
  coverPath: string | null;
  fingerprintPromptVersion: number;
}

export interface Edition {
  id: string;
  workId: string;
  format: FormatVerdict;
  printing: string | null;
  isbn13: string | null;
  pages: number | null;
  typicalPricePaise: number | null;
  formatNote: string | null;
}

export interface Path {
  id: string;
  name: string;
  pathKey: string;
  contextLevel: ContextLevel;
}

export interface PathItem {
  pathId: string;
  workId: string;
  position: number;
}

export interface LibraryEntry {
  workId: string;
  own: Own;
  status: ReadStatus;
  rating: number | null; // 1..5, maps to Not for me..Loved it
  finishedAt: string | null;
  notInterested: boolean;
}

export type SignalKind =
  | 'rating_loved' | 'rating_great' | 'rating_good' | 'rating_meh' | 'rating_not_for_me'
  | 'dropped' | 'chip' | 'swipe_right' | 'swipe_left' | 'swipe_up' | 'not_tonight'
  | 'calibrate' | 'appetite' | 'explore_outcome';

export type AppetiteAnswer = 'more' | 'mix' | 'new';

export type CalibrationAnswer = 'too_little' | 'just_right' | 'too_much';

export interface TasteEvent {
  id: string;
  workId: string | null;
  type: SignalKind;
  dimension: Dim | null;
  tag: { kind: 'genre' | 'creator' | 'character' | 'bucket'; value: string } | null;
  value: number | null; // e.g. swipe-up mini rating 1-3
  calibration: CalibrationAnswer | null; // set only when type === 'calibrate'
  appetite: AppetiteAnswer | null; // set only when type === 'appetite'
  exploreGoodOrBetter: boolean | null; // set only when type === 'explore_outcome'
  occurredAt: string; // ISO, client time
}
