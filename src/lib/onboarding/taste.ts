// From what the reader picked to usable product intelligence.
//
//   selections  ->  signals   (provenance: "said in onboarding", kept forever)
//               ->  events    (what the existing taste engine replays)
//               ->  summary   (the "starting taste" reveal, with honest confidence)
//
// Stated preference is not observed preference, and neither is ownership: the
// signal record keeps the SOURCE, and later reading is layered on top, never
// written over it.
import type { TasteEvent } from '../types/domain';
import { ART_STYLES, CHARACTER_BY_ID, CREATOR_BY_ID, GENRE_CARDS, STORY_TRAITS, type DimSeeds } from './entities';

export type Familiarity = 'new' | 'unknown' | 'experienced';

export interface TasteSelections {
  /** Any character the reader liked (heroes and villains alike — alignment is a UI grouping, not a model). */
  characters: string[];
  artStyles: string[];
  artists: string[];
  writers: string[];
  genres: string[];
  traits: string[];
  familiarity: Familiarity;
}

export const EMPTY_SELECTIONS: TasteSelections = {
  characters: [], artStyles: [], artists: [], writers: [], genres: [], traits: [], familiarity: 'unknown',
};

export type SignalEntityType = 'CHARACTER' | 'CREATOR' | 'ART_STYLE' | 'GENRE' | 'STORY_TRAIT';

export interface TasteSignal {
  entityType: SignalEntityType;
  entityId: string;
  signal: 'LIKE';
  source: 'ONBOARDING';
  strength: number;
}

export function buildSignals(sel: TasteSelections): TasteSignal[] {
  const mk = (entityType: SignalEntityType, ids: string[]): TasteSignal[] =>
    [...new Set(ids)].map((entityId) => ({ entityType, entityId, signal: 'LIKE' as const, source: 'ONBOARDING' as const, strength: 1 }));
  return [
    ...mk('CHARACTER', sel.characters), ...mk('CREATOR', [...sel.artists, ...sel.writers]),
    ...mk('ART_STYLE', sel.artStyles), ...mk('GENRE', sel.genres), ...mk('STORY_TRAIT', sel.traits),
  ];
}

/** Event id prefix: lets a re-run (or an edit) replace exactly the onboarding events and nothing else. */
export const ONBOARDING_EVENT_PREFIX = 'onb:';

const like = (id: string, kind: 'character' | 'creator' | 'genre', value: string, at: string): TasteEvent => ({
  id: `${ONBOARDING_EVENT_PREFIX}${id}`, workId: null, type: 'stated_like', dimension: null, tag: { kind, value },
  value: null, calibration: null, appetite: null, exploreGoodOrBetter: null, occurredAt: at,
});
const seed = (id: string, dimension: NonNullable<TasteEvent['dimension']>, value: number, at: string): TasteEvent => ({
  id: `${ONBOARDING_EVENT_PREFIX}${id}`, workId: null, type: 'preference_seed', dimension, tag: null,
  value, calibration: null, appetite: null, exploreGoodOrBetter: null, occurredAt: at,
});
const seedsToEvents = (idBase: string, seeds: DimSeeds, at: string): TasteEvent[] =>
  Object.entries(seeds).map(([dim, v]) => seed(`${idBase}:dim:${dim}`, dim as NonNullable<TasteEvent['dimension']>, v as number, at));

/** The events the taste engine replays. Stable ids => re-running onboarding replaces, never duplicates. */
export function signalsToEvents(sel: TasteSelections, now: Date): TasteEvent[] {
  const at = now.toISOString();
  const out: TasteEvent[] = [];
  for (const id of new Set(sel.characters)) {
    const c = CHARACTER_BY_ID.get(id);
    if (c) for (const name of new Set(c.catalogNames)) out.push(like(`${id}:${name}`, 'character', name, at));
  }
  for (const id of new Set([...sel.artists, ...sel.writers])) {
    const c = CREATOR_BY_ID.get(id);
    if (c) out.push(like(id, 'creator', c.name, at));
  }
  for (const id of new Set(sel.genres)) {
    const g = GENRE_CARDS.find((x) => x.id === id);
    if (g) for (const genre of new Set(g.genres)) out.push(like(`${id}:genre:${genre}`, 'genre', genre, at));
  }
  for (const id of new Set(sel.artStyles)) {
    const a = ART_STYLES.find((x) => x.id === id);
    if (a) out.push(...seedsToEvents(id, a.seeds, at));
  }
  for (const id of new Set(sel.traits)) {
    const t = STORY_TRAITS.find((x) => x.id === id);
    if (!t) continue;
    for (const genre of new Set(t.genres)) out.push(like(`${id}:genre:${genre}`, 'genre', genre, at));
    out.push(...seedsToEvents(id, t.seeds, at));
  }
  return out;
}

// ---- the "starting taste" reveal ---------------------------------------------------

export type Confidence = 'unknown' | 'low' | 'medium' | 'high';

export interface StartingTaste {
  /** Nothing was picked at all. */
  empty: boolean;
  /** Up to four words, e.g. Dark · Detective · Character-driven. */
  leanings: string[];
  characters: string[];
  visual: string[];
  story: string[];
  confidence: { characters: Confidence; genres: Confidence; artwork: Confidence; creators: Confidence; reading: Confidence };
}

const confidenceFor = (n: number, medium: number, high: number): Confidence => (n >= high ? 'high' : n >= medium ? 'medium' : n >= 1 ? 'low' : 'unknown');

function averageSeeds(sel: TasteSelections): Partial<Record<string, number>> {
  const sums: Record<string, { s: number; n: number }> = {};
  const add = (seeds: DimSeeds) => { for (const [d, v] of Object.entries(seeds)) { sums[d] ??= { s: 0, n: 0 }; sums[d].s += v as number; sums[d].n += 1; } };
  for (const id of sel.artStyles) { const a = ART_STYLES.find((x) => x.id === id); if (a) add(a.seeds); }
  for (const id of sel.traits) { const t = STORY_TRAITS.find((x) => x.id === id); if (t) add(t.seeds); }
  return Object.fromEntries(Object.entries(sums).map(([d, x]) => [d, x.s / x.n]));
}

export function summarizeTaste(sel: TasteSelections): StartingTaste {
  const empty = Object.entries(sel).every(([k, v]) => k === 'familiarity' || (v as string[]).length === 0);
  const dims = averageSeeds(sel);
  const genreIds = new Set(sel.genres);
  const traitIds = new Set(sel.traits);
  const leanings: string[] = [];
  const push = (label: string) => { if (!leanings.includes(label)) leanings.push(label); };

  if ((dims.tone ?? 0.5) >= 0.7) push('Dark'); else if (dims.tone !== undefined && dims.tone <= 0.3) push('Light-hearted');
  if (genreIds.has('genre:detective') || traitIds.has('trait:mystery')) push('Detective');
  if (genreIds.has('genre:crime')) push('Crime');
  if (genreIds.has('genre:horror')) push('Horror-leaning');
  if (traitIds.has('trait:characters') || genreIds.has('genre:drama') || traitIds.has('trait:relationships')) push('Character-driven');
  if ((dims.scale ?? 0) >= 0.75 || genreIds.has('genre:cosmic')) push('Epic');
  if ((dims.complexity ?? 0) >= 0.7) push('Layered');
  if ((dims.artForward ?? 0) >= 0.8) push('Art-forward');
  if ((dims.pace ?? 0) >= 0.75) push('Fast-paced');
  if ((dims.violence ?? 0) >= 0.7) push('Intense');
  if (genreIds.has('genre:sci-fi')) push('Sci-fi');
  if (genreIds.has('genre:superhero')) push('Superhero');

  const name = (id: string) => CHARACTER_BY_ID.get(id)?.name;
  const styles = sel.artStyles.map((id) => ART_STYLES.find((x) => x.id === id)?.label).filter((x): x is string => !!x);
  const story = [
    ...sel.genres.map((id) => GENRE_CARDS.find((x) => x.id === id)?.label),
    ...sel.traits.map((id) => STORY_TRAITS.find((x) => x.id === id)?.label),
  ].filter((x): x is string => !!x);

  return {
    empty,
    leanings: leanings.slice(0, 4),
    characters: sel.characters.map(name).filter((x): x is string => !!x).slice(0, 3),
    visual: styles.slice(0, 3),
    story: story.slice(0, 4),
    // A few stated picks are a starting point, not a verdict: nothing here is 'high' for reading behaviour.
    confidence: {
      characters: confidenceFor(sel.characters.length, 3, 6),
      genres: confidenceFor(sel.genres.length + sel.traits.length, 2, 5),
      artwork: confidenceFor(sel.artStyles.length + sel.artists.length, 2, 4),
      creators: confidenceFor(sel.artists.length + sel.writers.length, 3, 6),
      reading: 'unknown',
    },
  };
}
