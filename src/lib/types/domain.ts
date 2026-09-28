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

// The real comics-market distinction between physical/digital PRODUCTS of a
// work — what the "which one should I buy" comparison and the Compare
// screen's purchase labels actually turn on.
export type PrintingType =
  | 'single_issue' | 'trade_paperback' | 'hardcover' | 'deluxe'
  | 'omnibus' | 'absolute' | 'compact' | 'digital';

export type CreatorRole = 'writer' | 'artist' | 'inker' | 'colorist' | 'letterer' | 'cover';

/** One periodical run — e.g. one numbered volume of an ongoing title. A
 *  title relaunched with a new #1 is a different Series row, not the same
 *  one continuing. */
export interface Series {
  id: string;
  name: string;
  publisher: string | null;
  universe: Universe;
  volumeLabel: string | null; // "Vol. 2", "(2011)"
  startYear: number | null;
  endYear: number | null; // null if ongoing
}

/** One periodical chapter. `sortPosition` (not the display `issueNumber`)
 *  is what orders issues correctly — annuals and specials don't sort as
 *  plain numbers, but have a real place in the series' run. */
export interface Issue {
  id: string;
  seriesId: string;
  issueNumber: string; // display label: "1", "0", "Annual 1"
  sortPosition: number;
  title: string | null;
  coverDate: string | null; // "YYYY-MM"
  onSaleDate: string | null;
  pageCount: number | null;
  coverPath: string | null;
  synopsis: string | null;
}

export interface IssueCreatorCredit {
  issueId: string;
  creatorName: string;
  role: CreatorRole;
}

/** A `work` is the STORY as a reading unit — what the rest of the app
 *  scores, recommends, and tracks reading status for. `work_issues` (see
 *  the query layer) says exactly which issues make it up, in order. */
export interface Work {
  id: string;
  title: string;
  sortTitle: string;
  matchKey: string;
  publisher: string | null;
  universe: Universe;
  primarySeriesId: string | null; // convenience pointer; work_issues is the source of truth
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

export interface WorkIssue {
  workId: string;
  issueId: string;
  position: number;
}

/** A physical/digital PRODUCT. Scoped to either issues (a single-issue
 *  purchase — edition_issues, typically one row) or works (everything else
 *  — edition_works), never both. An omnibus or "complete collection" edition
 *  can span MULTIPLE works, which is why edition_works is a join table
 *  rather than a single work_id foreign key. */
export interface Edition {
  id: string;
  printing: PrintingType;
  format: FormatVerdict; // orthogonal to printing — a digital single issue is printing='single_issue', format='digital'
  isbn13: string | null;
  diamondCode: string | null; // single-issue distributor code, where relevant
  pages: number | null;
  typicalPricePaise: number | null;
  releaseDate: string | null;
  formatNote: string | null;
}

export interface EditionWork {
  editionId: string;
  workId: string;
  position: number; // ordering within a multi-work omnibus
}

export interface EditionIssue {
  editionId: string;
  issueId: string;
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
