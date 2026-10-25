// What each picking step offers, and how "related" is decided for it.
// Character relations are curated; creator relations come from the catalog's
// own credits (see lib/onboarding/graph). Built once, on first use.
import { CHARACTERS, CREATORS, RELATIONSHIPS, type Entity } from '../../lib/onboarding/entities';
import { characterGraph, creatorGraph } from '../../lib/onboarding/graph';
import type { Neighbour } from '../../lib/onboarding/discovery';
import type { Stage } from '../../lib/onboarding/flow';
import { loadAllScorableWorks } from '../../lib/db/queries/library';

export type DiscoveryStage = 'characters' | 'villains' | 'artists' | 'writers';

export const isDiscoveryStage = (s: Stage): s is DiscoveryStage => s === 'characters' || s === 'villains' || s === 'artists' || s === 'writers';

let creatorRelate: ((id: string) => Neighbour[]) | null = null;
const charRelate = characterGraph(RELATIONSHIPS);

export function relateFor(stage: DiscoveryStage): (id: string) => Neighbour[] {
  if (stage === 'characters' || stage === 'villains') return charRelate;
  if (!creatorRelate) {
    const works = [...loadAllScorableWorks().values()].map((w) => ({ id: w.id, characters: w.characters, genres: w.genres, creators: w.creators, publisher: w.universe }));
    creatorRelate = creatorGraph(CREATORS, works);
  }
  return creatorRelate;
}

export function poolFor(stage: DiscoveryStage): Entity[] {
  switch (stage) {
    case 'characters': return CHARACTERS.filter((c) => c.alignment !== 'villain');
    case 'villains': return CHARACTERS.filter((c) => c.alignment === 'villain');
    case 'artists': return CREATORS.filter((c) => c.roles.includes('artist'));
    case 'writers': return CREATORS.filter((c) => c.roles.includes('writer'));
  }
}

/** Villains who are enemies of the heroes the reader picked come first. */
export function preferFor(stage: DiscoveryStage, picked: readonly string[]): (e: Entity) => number {
  if (stage !== 'villains') return () => 0;
  const heroes = new Set(picked);
  const score = new Map<string, number>();
  for (const r of RELATIONSHIPS) {
    if (r.type !== 'ENEMY' && r.type !== 'RIVAL') continue;
    if (heroes.has(r.from)) score.set(r.to, (score.get(r.to) ?? 0) + r.strength);
    if (heroes.has(r.to)) score.set(r.from, (score.get(r.from) ?? 0) + r.strength);
  }
  return (e) => score.get(e.id) ?? 0;
}

export const COPY: Record<DiscoveryStage, { title: string; subtitle: string; empty: string }> = {
  characters: { title: 'Who do you love?', subtitle: 'Tap the characters you enjoy. More will appear as you go — pick at least 3.', empty: 'That’s everyone we have here. Search for anyone we missed.' },
  villains: { title: 'And their enemies?', subtitle: 'Great stories need great villains. Tap the ones you love to see.', empty: 'That’s every villain we have. Search for anyone we missed.' },
  artists: { title: 'Any artists you love?', subtitle: 'The look of a comic matters. Skip this if you’re not sure.', empty: 'That’s everyone we have. Search for anyone we missed.' },
  writers: { title: 'Any writers you follow?', subtitle: 'Voices you trust. Skip this if you’re not sure.', empty: 'That’s everyone we have. Search for anyone we missed.' },
};
