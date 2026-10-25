// Plain types for the Mind Space engine. Nothing here knows about the phone, the database or the
// network, so every rule can be unit-tested in milliseconds.
export type Importance = 'required' | 'helpful' | 'optional';
export type Confidence = 'verified' | 'ai_suggested';
export type ReadStatus = 'planned' | 'reading' | 'finished' | 'dropped';

export type Series = {
  id: string;
  title: string;
  /** Volumes or issues — the unit the reader counts in. 0 = unknown (treated as 1). */
  units: number;
  /** Publication year, used to order "oldest to newest". */
  year?: number;
  status: ReadStatus;
};

/** "Read `before` before `after`." Already normalised from sequel / prequel / spin-off wording. */
export type PrereqEdge = {
  before: string;
  after: string;
  importance: Importance;
  confidence: Confidence;
  /** The reader pressed "looks wrong" — the edge is ignored, forever. */
  wrong?: boolean;
};

export type PlanItem = { id: string; title: string; units: number; importance: Importance; confidence: Confidence; status: ReadStatus };

export type ReadingOrder = {
  /** Unfinished prerequisites, required ones first (oldest to newest), then helpful ones. */
  readFirst: PlanItem[];
  /** What comes after, at most two steps on. */
  then: PlanItem[];
  /** Units still to read across `readFirst`. */
  unitsToRead: number;
};

export const unitsOf = (s: { units: number }) => Math.max(1, s.units || 0);
