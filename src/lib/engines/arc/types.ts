// Arc = a personal reading journey, structured as
//   goal -> path (template) -> chapter -> milestone -> work.
// A milestone is a story beat ("Dick Grayson becomes Robin"), not a book;
// books are attached to the beat they get the reader to. That is what lets
// ComicPill say WHY a book is on the list and what the reader is building
// toward, instead of numbering a reading order.
import type { Own, ReadStatus } from '../../types/domain';

/** Continuity labels are mandatory data, never inferred at render time — an
 *  arc must never silently chain a possible future or an Elseworld onto the
 *  main timeline as if it were the next chapter. */
export type Continuity =
  | 'main' | 'alternate' | 'possible_future' | 'elseworld'
  | 'retelling' | 'soft_reboot' | 'flashback';

export type ArcTier = 'essential' | 'recommended' | 'optional' | 'deep_cut';
export type ArcDepth = 'essential' | 'recommended' | 'completionist';

/** Which tiers each depth includes. Essential ⊂ Recommended ⊂ Completionist. */
export const DEPTH_TIERS: Record<ArcDepth, ArcTier[]> = {
  essential: ['essential'],
  recommended: ['essential', 'recommended'],
  completionist: ['essential', 'recommended', 'optional', 'deep_cut'],
};
export const DEFAULT_ARC_DEPTH: ArcDepth = 'recommended';

export type ArcKind =
  | 'character_life_arc' | 'story_arc' | 'family_arc' | 'creator_run' | 'event_path'
  | 'universe_path' | 'origin_path' | 'relationship_arc' | 'villain_arc'
  | 'transformation_arc' | 'legacy_arc' | 'custom_goal';

export interface ArcItemDef {
  workId: string;
  tier: ArcTier;
  continuity: Continuity;
  /** "Why am I reading this?" — spoiler-safe by default. */
  why: string;
  /** "Can I skip this?" — only needed when the generic tier answer isn't specific enough. */
  skip?: { impact: string; missed: string; recommendation: string };
}

export interface ArcMilestoneDef {
  id: string;
  title: string;
  /** The story/character change this beat delivers. */
  change: string;
  /** Character this beat is about, for the family-tree visual. */
  character?: string;
  items: ArcItemDef[];
}

export interface ArcChapterDef {
  id: string;
  title: string;
  tagline: string;
  milestones: ArcMilestoneDef[];
}

/** The endgame is not one canonical ending — it is a choice between
 *  continuities. Branch items never count toward main progress and never
 *  become the automatic "read next". */
export interface ArcBranchDef {
  id: string;
  label: string;
  description: string;
  continuityNote: string;
  items: ArcItemDef[];
}

export interface ArcEndgameDef {
  id: string;
  title: string;
  tagline: string;
  question: string;
  branches: ArcBranchDef[];
}

/** The "Bruce starts alone -> the family grows" picture. Each identity is
 *  unlocked by a milestone, so the tree fills in as the reader progresses. */
export interface ArcFamilyDef {
  root: string;
  branches: { name: string; identities: { label: string; milestoneId: string }[] }[];
}

/** A side path a reader can take from a milestone without leaving this one
 *  (e.g. "Follow Nightwing" from Dick's Nightwing milestone). */
export interface ArcBranchOffer {
  milestoneId: string;
  /** Template that becomes the new journey. */
  templateKey: string;
  label: string;
  pitch: string;
}

export interface ArcTemplate {
  key: string;
  title: string;
  goal: string;
  kinds: ArcKind[];
  character: string; // the character the arc is centred on
  /** Extra names a reader might use for this journey ("Bat-Family", a key book). Matching also derives terms from the family tree and milestones. */
  aliases?: string[];
  chapters: ArcChapterDef[];
  endgame?: ArcEndgameDef;
  family?: ArcFamilyDef;
  branches?: ArcBranchOffer[];
}

// ---- built plan ------------------------------------------------------------

export type ArcItemState = 'finished' | 'reading' | 'owned_unread' | 'not_owned' | 'dropped';
export type ArcProgressStatus = 'complete' | 'current' | 'upcoming';

export interface ArcLibraryEntry { status: ReadStatus; own: Own }
export type ArcLibrary = ReadonlyMap<string, ArcLibraryEntry>;

export interface ArcItem extends ArcItemDef {
  state: ArcItemState;
  own: Own;
}

export interface ArcMilestone {
  id: string;
  title: string;
  change: string;
  character?: string;
  status: ArcProgressStatus;
  items: ArcItem[];
}

export interface ArcChapter {
  id: string;
  title: string;
  tagline: string;
  status: ArcProgressStatus;
  milestones: ArcMilestone[];
  finishedItems: number;
  totalItems: number;
}

export interface ArcBranch extends Omit<ArcBranchDef, 'items'> { items: ArcItem[] }
export interface ArcEndgame extends Omit<ArcEndgameDef, 'branches'> { branches: ArcBranch[] }

export interface ArcFamily {
  root: string;
  branches: { name: string; identities: { label: string; status: ArcProgressStatus }[] }[];
}

export interface ArcNextStep {
  workId: string;
  state: ArcItemState;
  own: Own;
  tier: ArcTier;
  why: string;
  milestoneId: string;
  milestoneTitle: string;
  chapterId: string;
  chapterTitle: string;
}

export interface ArcPlan {
  key: string;
  title: string;
  goal: string;
  depth: ArcDepth;
  chapters: ArcChapter[];
  endgame: ArcEndgame | null;
  family: ArcFamily | null;
  /** Side paths offered at milestones this plan contains. */
  branchOffers: (ArcBranchOffer & { status: ArcProgressStatus })[];
  milestonesComplete: number;
  milestonesTotal: number;
  percentComplete: number; // whole milestones, not books
  currentMilestoneId: string | null;
  /** The beat AFTER the current one — "next major milestone". */
  upcomingMilestone: { id: string; title: string; change: string } | null;
  nextStep: ArcNextStep | null;
  /** True once every main-path milestone is complete; the endgame choice is next. */
  atEndgame: boolean;
}

export interface SkipAdvice {
  workId: string;
  canSkip: boolean;
  headline: string;
  impact: string;
  missed: string;
  recommendation: string;
}
