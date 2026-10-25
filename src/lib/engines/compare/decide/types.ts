// Compare V2: a decision, not a scoreboard.
//
//   candidates -> eligibility -> context -> hard constraints -> soft
//   preferences -> pairwise -> sequence -> verdict -> explanation
//
// The ten dimensions still exist, but they are supporting evidence. What the
// reader is given is an ORDER (one #1, one #2 …), the case for and against
// each book, and why the top pick beats the others — all derived from
// structured evidence, with no language model involved.
import type { FinishedRead, ScorableWork, TasteProfile } from '../../../types/engine-io';

export type ReadingState = 'unread' | 'reading' | 'finished' | 'dropped';

/** Temporary "what matters tonight" modifiers. Optional; default is 'best'. */
export type Intent = 'best' | 'continue_path' | 'darkest' | 'short' | 'different';

export type TravelMode = 'any' | 'digital';

export type DimensionKey =
  | 'readiness' | 'goal' | 'continuity' | 'taste' | 'mood'
  | 'experience' | 'character' | 'access' | 'commitment' | 'variety';

export interface DimensionScore {
  key: DimensionKey;
  score: number; // 0..1; used for ordering only, never shown as a number
  label: string; // the human word shown in the glance table
}

// ---- inputs -----------------------------------------------------------------

/** Where a book sits in a journey the reader is actively following. */
export interface JourneyPosition {
  arcId: string;
  arcTitle: string;
  chapterTitle: string;
  milestoneTitle: string;
  isNext: boolean;
}

/** An edge INTO this book: something that comes before it in the story. */
export interface Predecessor {
  workId: string;
  title: string;
  state: ReadingState;
  /** required_context blocks readiness; direct_sequel only orders. */
  kind: 'direct_sequel' | 'required_context';
}

export interface CandidateInput {
  work: ScorableWork;
  state: ReadingState;
  journey: JourneyPosition | null;
  predecessors: Predecessor[];
}

export interface ComparisonContext {
  profile: TasteProfile;
  mood: string | null;
  intent: Intent;
  travelMode: TravelMode;
  rereadsAllowed: boolean;
  recentFinished: FinishedRead[]; // most recent first
  currentlyReading: { workId: string; title: string }[];
  /** Titles of the journeys the reader is following (may be empty). */
  activeJourneys: string[];
  titleById: ReadonlyMap<string, string>;
}

// ---- access -----------------------------------------------------------------

/** Can the reader open this tonight? Owning two copies is not "more
 *  available" than owning one — it is a yes/no, not a preference. */
export interface Access {
  status: 'available' | 'not_now' | 'not_owned';
  /** Short label: "Physical", "Digital", "Physical + digital", "Not owned"… */
  label: string;
}

// ---- evidence ---------------------------------------------------------------

export type EvidenceType =
  | 'direct_continuation' | 'active_path_progress' | 'in_journey' | 'in_progress'
  | 'earlier_unread' | 'missing_prerequisite'
  | 'ready_in_hand' | 'not_available_now' | 'not_owned'
  | 'taste_genre' | 'taste_character' | 'taste_general'
  | 'mood_match' | 'off_mood'
  | 'short_read' | 'long_read'
  | 'change_of_pace' | 'same_lane'
  | 'off_goal' | 'reread';

export interface Evidence {
  type: EvidenceType;
  polarity: 'pro' | 'con' | 'block';
  strength: 'major' | 'minor';
  /** The entities behind the claim (titles, genres, …) — kept structured. */
  data: Record<string, string>;
  /** Rendered from the template for this type; never free-form. */
  text: string;
}

// ---- outputs ----------------------------------------------------------------

export type Role = 'read_now' | 'read_after' | 'detour' | 'later' | 'get_first' | 'blocked';

export interface RankedEntry {
  position: number; // 1-based, unique
  workId: string;
  title: string;
  role: Role;
  tier: 0 | 1; // 0 = readable tonight with nothing in the way
  priority: number; // internal ordering value, never shown
  dimensions: DimensionScore[];
  access: Access;
  pros: Evidence[];
  cons: Evidence[];
  blockers: Evidence[];
  caseFor: string[];
  caseAgainst: string[];
  /** Why this is not first (empty for #1). */
  whyNotFirst: string[];
  bestFor: string;
  tradeOff: string | null;
  isReread: boolean;
}

export interface ExcludedEntry {
  workId: string;
  title: string;
  reason: 'already_finished' | 'dropped';
  canReread: boolean;
}

export interface PairwiseFactor {
  key: DimensionKey | 'order' | 'intent';
  favors: 'winner' | 'other';
  text: string;
}

export interface Pairwise {
  winnerId: string;
  otherId: string;
  /** 'tie' = nothing on the evidence separates them. */
  decidedBy: DimensionKey | 'order' | 'constraint' | 'intent' | 'tie';
  factors: PairwiseFactor[];
  summary: string;
}

export interface Relationship {
  from: string;
  to: string;
  relation: 'RECOMMENDED_BEFORE';
  /** What kind of "before" this is — story order is not the same as taste. */
  basis: 'STORY_ORDER' | 'PATH_ORDER' | 'PREFERENCE_ORDER';
  reason: string;
}

export interface GlanceRow {
  key: DimensionKey;
  name: string;
  informative: boolean;
  cells: { workId: string; label: string }[];
}

export interface Glance {
  rows: GlanceRow[]; // informative rows first
  /** Dimensions that don't separate the candidates, collapsed into one line each. */
  uniformNotes: string[];
}

export interface AnswerChange { label: string; workId: string; title: string }

export interface ReadDecision {
  context: {
    intent: Intent; mood: string | null; travelMode: TravelMode; rereadsAllowed: boolean; activeJourneys: string[];
  };
  excluded: ExcludedEntry[];
  order: RankedEntry[];
  primary: { workId: string; title: string; headline: string; explanation: string; status: string } | null;
  thenNext: { workId: string; title: string } | null;
  /** "Why it beats the others", one line per other eligible book. */
  beatsOthers: { workId: string; title: string; text: string }[];
  pairwise: Pairwise[];
  relationships: Relationship[];
  changesAnswer: AnswerChange[];
  glance: Glance;
  confidence: 'high' | 'medium' | 'low';
  /** Set when confidence is not high: an honest "either is reasonable". */
  closeCall: string | null;
}
