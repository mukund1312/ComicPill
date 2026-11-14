// The shape of the onboarding journey: its stages, how they connect, and how
// saved progress is read back. Pure, so resume-after-relaunch is testable.
import { ART_STYLES, CHARACTER_BY_ID, CREATOR_BY_ID, GENRE_CARDS, STORY_TRAITS } from './entities';
import { EMPTY_SELECTIONS, type Familiarity, type TasteSelections } from './taste';
import { OWNERSHIP_ORDER, READING_ORDER, type DraftItem } from './collectionDraft';

export type Stage =
  | 'welcome' | 'characters' | 'villains' | 'art' | 'artists' | 'writers' | 'genres' | 'traits'
  | 'processing' | 'reveal' | 'storage' | 'hidden_shelf' | 'collection' | 'library_ready' | 'first_pick' | 'done';

export const STAGE_ORDER: Stage[] = [
  'welcome', 'characters', 'villains', 'art', 'artists', 'writers', 'genres', 'traits',
  'processing', 'reveal', 'storage', 'hidden_shelf', 'collection', 'library_ready', 'first_pick', 'done',
];

/** The picking stages, which get the little progress dots. */
export const PICK_STAGES: Stage[] = ['characters', 'villains', 'art', 'artists', 'writers', 'genres', 'traits'];

export const isStage = (v: unknown): v is Stage => typeof v === 'string' && (STAGE_ORDER as string[]).includes(v);

export function nextStage(stage: Stage, editing = false): Stage {
  // Editing your picks later saves and leaves; it doesn't replay the reveal or the collection.
  if (editing && stage === 'traits') return 'done';
  const i = STAGE_ORDER.indexOf(stage);
  return STAGE_ORDER[Math.min(STAGE_ORDER.length - 1, i + 1)];
}

/** Someone new to comics isn't asked to name artists and writers — they can't yet. */
const SKIPPED_FOR_NEWCOMERS: readonly Stage[] = ['artists', 'writers'];

export function nextStageFor(stage: Stage, editing: boolean, familiarity: Familiarity): Stage {
  let next = nextStage(stage, editing);
  while (familiarity === 'new' && SKIPPED_FOR_NEWCOMERS.includes(next)) next = nextStage(next, editing);
  return next;
}

export function prevStageFor(stage: Stage, editing: boolean, familiarity: Familiarity): Stage | null {
  let prev = prevStage(stage, editing);
  while (prev && familiarity === 'new' && SKIPPED_FOR_NEWCOMERS.includes(prev)) prev = prevStage(prev, editing);
  return prev;
}

export function prevStage(stage: Stage, editing = false): Stage | null {
  const first = editing ? 'characters' : 'welcome';
  if (stage === first) return null;
  // Once the taste is processed there is no "back" into the middle of it.
  if (!PICK_STAGES.includes(stage) && stage !== 'welcome') return null;
  return STAGE_ORDER[Math.max(0, STAGE_ORDER.indexOf(stage) - 1)];
}

export function progressOf(stage: Stage): { index: number; total: number } | null {
  const i = PICK_STAGES.indexOf(stage);
  return i < 0 ? null : { index: i, total: PICK_STAGES.length };
}

export interface OnboardingState {
  stage: Stage;
  /** All done — Today opens directly from now on. */
  completed: boolean;
  tasteSetupCompleted: boolean;
  collectionSetupCompleted: boolean;
  /** Re-doing just the taste picks from Profile, not the whole tour. */
  editing: boolean;
  selections: TasteSelections;
  /** Books being set up in the collection step, kept so a relaunch doesn't lose them. */
  draft: DraftItem[];
  /** Seeds the "exploration" slot so choices are stable across re-renders and relaunches. */
  seed: number;
}

export const INITIAL_ONBOARDING: OnboardingState = {
  stage: 'welcome', completed: false, tasteSetupCompleted: false, collectionSetupCompleted: false, editing: false,
  selections: EMPTY_SELECTIONS, draft: [], seed: 1,
};

const MAX_PICKS = 60;
const MAX_DRAFT = 400;

const SOURCES = ['shelf_scan', 'screenshot', 'manual'];

function sanitizeDraft(raw: unknown): DraftItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: DraftItem[] = [];
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) continue;
    const x = r as Record<string, unknown>;
    if (typeof x.workId !== 'string' || !x.workId || seen.has(x.workId) || typeof x.title !== 'string') continue;
    if (!OWNERSHIP_ORDER.includes(x.ownership as never) || !READING_ORDER.includes(x.reading as never)) continue;
    seen.add(x.workId);
    out.push({
      workId: x.workId, title: x.title.slice(0, 200), ownership: x.ownership as DraftItem['ownership'], reading: x.reading as DraftItem['reading'],
      source: SOURCES.includes(x.source as string) ? (x.source as DraftItem['source']) : 'manual',
    });
    if (out.length >= MAX_DRAFT) break;
  }
  return out;
}

const known = (ids: unknown, valid: (id: string) => boolean): string[] =>
  Array.isArray(ids) ? [...new Set(ids.filter((x): x is string => typeof x === 'string' && valid(x)))].slice(0, MAX_PICKS) : [];

/** Read progress back from storage: unknown stages, stale ids (an entity removed
 *  in a later version), duplicates and junk are all dropped, never trusted. */
export function sanitizeOnboarding(raw: unknown): OnboardingState {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const sel = (typeof r.selections === 'object' && r.selections !== null ? r.selections : {}) as Record<string, unknown>;
  const fam: Familiarity = sel.familiarity === 'new' || sel.familiarity === 'experienced' ? sel.familiarity : 'unknown';
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const completed = bool(r.completed, false);
  return {
    stage: completed ? 'done' : isStage(r.stage) ? r.stage : 'welcome',
    completed,
    tasteSetupCompleted: bool(r.tasteSetupCompleted, false),
    collectionSetupCompleted: bool(r.collectionSetupCompleted, false),
    editing: bool(r.editing, false),
    draft: sanitizeDraft(r.draft),
    seed: typeof r.seed === 'number' && Number.isFinite(r.seed) ? Math.trunc(r.seed) : 1,
    selections: {
      characters: known(sel.characters, (id) => CHARACTER_BY_ID.has(id)),
      artStyles: known(sel.artStyles, (id) => ART_STYLES.some((a) => a.id === id)),
      artists: known(sel.artists, (id) => CREATOR_BY_ID.get(id)?.roles.includes('artist') ?? false),
      writers: known(sel.writers, (id) => CREATOR_BY_ID.get(id)?.roles.includes('writer') ?? false),
      genres: known(sel.genres, (id) => GENRE_CARDS.some((g) => g.id === id)),
      traits: known(sel.traits, (id) => STORY_TRAITS.some((t) => t.id === id)),
      familiarity: fam,
    },
  };
}

/** Which list a stage's picks go into. */
export type PickKey = keyof Omit<TasteSelections, 'familiarity'>;
export const STAGE_PICKS: Partial<Record<Stage, PickKey>> = {
  characters: 'characters', villains: 'characters', art: 'artStyles', artists: 'artists', writers: 'writers', genres: 'genres', traits: 'traits',
};

/** Minimum picks before the primary button lights up — but "Skip" is always available. */
export const MIN_PICKS: Partial<Record<Stage, number>> = { characters: 3 };
