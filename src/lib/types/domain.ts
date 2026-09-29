// Domain types shared across the DB layer, engines, and UI.
// Engines only ever see the "engine-io" subset — see engine-io.ts.

export type Dim =
  | 'tone' | 'violence' | 'scale' | 'complexity'
  | 'mystery' | 'pace' | 'artForward' | 'commitment';

export const DIMENSIONS: Dim[] = [
  'tone', 'violence', 'scale', 'complexity', 'mystery', 'pace', 'artForward', 'commitment',
];

export type Fingerprint = Record<Dim, number>; // each 0..1

// 'wishlist' and 'ordered' are distinct from 'none': "I want this" and "I
// paid for this but it hasn't arrived" are both real states a user reports,
// not just "not owned". 'subscription' covers reading via a service without
// owning a copy (own it in the sense of "can read now", not "on my shelf").
export type Own = 'physical' | 'digital' | 'both' | 'wishlist' | 'ordered' | 'subscription' | 'none';
export type ReadStatus = 'none' | 'reading' | 'done' | 'dropped';
export type FormatVerdict = 'physical' | 'digital';
export type ContextNeeded = 'none' | 'helpful' | 'required';
export type ContextLevel = 'simple' | 'recommended' | 'completionist';
export type Universe = 'main' | 'alternate' | 'standalone';
// Whether a work is a satisfying read on its own, or needs more of its run.
export type Completeness = 'complete' | 'ongoing' | 'part_of_n';
export type SeriesStatus = 'ongoing' | 'complete' | 'hiatus';

export type EdgeType =
  | 'direct_sequel' | 'required_context' | 'optional_context'
  | 'same_run' | 'same_event' | 'alternate_universe' | 'similar_tone';

// How strongly readers should be pushed toward a story-edge relationship —
// separate from the edge's TYPE (what kind of relationship it is). Two
// direct_sequel edges can carry different real-world urgency (a hard plot
// dependency vs. "reads fine either order, but this is the intended one").
// 'required' must never be skippable regardless of context level; everything
// else is a matter of degree, which is exactly what "can I skip this?" and
// "what am I missing?" need to answer with more than a binary.
export type EdgeStrength =
  | 'required' | 'strongly_recommended' | 'useful_context' | 'optional' | 'tie_in';

// The real comics-market distinction between physical/digital PRODUCTS of a
// work — what the "which one should I buy" comparison and the Compare
// screen's purchase labels actually turn on.
export type PrintingType =
  | 'single_issue' | 'trade_paperback' | 'hardcover' | 'deluxe'
  | 'omnibus' | 'absolute' | 'compact' | 'digital';

export type CreatorRole = 'writer' | 'artist' | 'inker' | 'colorist' | 'letterer' | 'cover';

// A real, formalized enum — this is deliberate. Genres were previously a
// bare string[] with the allowed list living only inside prompt text, which
// is exactly how 'heroic' got silently dropped and no model could produce it
// even though the seed data used it (found during the calibration test in
// FINGERPRINTING-COST-ANALYSIS.md). Also includes the semantic/experiential
// tags readers actually search by ("give me crazy universe-ending shit" is a
// real, common intent) rather than only structural genre labels.
export type Genre =
  | 'detective' | 'mystery' | 'crime' | 'horror' | 'sci-fi' | 'mythic' | 'satire'
  | 'war' | 'supernatural' | 'drama' | 'heroic' | 'comedy' | 'political' | 'dystopia'
  | 'cosmic' | 'multiverse' | 'gods' | 'reality_warping' | 'apocalypse' | 'street_level';

/** One periodical run — e.g. one numbered volume of an ongoing title. A
 *  title relaunched with a new #1 is a different Series row, not the same
 *  one continuing. `status`/`releasedVolumeCount` answer "how many volumes
 *  are there" honestly: an ongoing series has a released count, never a
 *  total — "9 released" and "9 total" are different facts and must not be
 *  conflated. */
export interface Series {
  id: string;
  name: string;
  publisher: string | null;
  universe: Universe;
  volumeLabel: string | null; // "Vol. 2", "(2011)"
  startYear: number | null;
  endYear: number | null; // null if ongoing
  status: SeriesStatus;
  releasedVolumeCount: number | null; // how many collected volumes exist so far
  plannedVolumeCount: number | null; // only meaningful when status === 'complete' or a publisher has announced a fixed run
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
  genres: Genre[];
  creators: string[];
  characters: string[];
  keeperFlag: boolean;
  contextNeeded: ContextNeeded;
  completeness: Completeness; // "is this a satisfying read on its own?" — shown before purchase
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

// A playlist is a personal, editable reading list — the same "ordered works
// you move through" idea as a Path, but user-owned instead of catalog-curated:
// a reader (or the app, on their behalf) builds it, can reorder/add/remove
// freely, and it carries no story-graph expansion (a Path expands via
// story_edges to a context level; a playlist is exactly the works put in it).
// Reading progress is NOT stored here — same as Paths, it's derived from
// user_library.status per work, so there's one source of truth for "have I
// read this" everywhere in the app.
export type PlaylistOrigin = 'user' | 'app';

export interface Playlist {
  id: string;
  name: string;
  createdBy: PlaylistOrigin;
  // What the app used to generate this, if createdBy === 'app' (a mood id,
  // a character name, a "surprise me" seed) — shown back to the reader as
  // "Why this playlist" and useful for regenerating/refining later. Null for
  // hand-built playlists.
  sourceHint: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistItem {
  playlistId: string;
  workId: string;
  position: number;
  addedAt: string;
}

export interface LibraryEntry {
  workId: string;
  own: Own;
  // Which SPECIFIC edition the reader owns (not just which format) — needed
  // to answer "should I upgrade from the Compact I have to the Deluxe I'm
  // eyeing", which is a different question from "should I upgrade from
  // digital to physical" and can't be answered from `own` alone.
  ownedEditionId: string | null;
  status: ReadStatus;
  rating: number | null; // 1..5, maps to Not for me..Loved it
  finishedAt: string | null;
  notInterested: boolean;
  // Real purchase history — "how much have I spent" and "was this a good
  // price" both need what was actually paid, not just the catalog's
  // typicalPricePaise.
  pricePaidPaise: number | null;
  purchasedAt: string | null;
  store: string | null;
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
