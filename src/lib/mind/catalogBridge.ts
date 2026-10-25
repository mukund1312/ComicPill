// The local catalog (1,000 fingerprinted books) is the best-verified source Mind Space has, and it needs
// no network. These pure helpers turn a catalog work into the shapes the rest of Mind Space speaks.
import type { ExternalRelation, ExternalSeries, Medium } from './remote/types';
import { emptyTags, type Tags } from './engine/tasteScorer';
import type { Confidence, Importance } from './engine/types';

export type CatalogWork = {
  id: string; title: string; publisher: string | null; genres: string[]; creators: string[];
  fingerprint: Record<string, number> | null; completeness: string; summary: string | null; coverPath: string | null;
};

export type CatalogEdge = { fromWork: string; toWork: string; type: string; strength: string; confirmed: boolean };

const MANGA_PUBLISHERS = /manga|viz|kodansha|shueisha|shogakukan|square enix|yen press|seven seas|kadokawa|shonen|tokyopop/i;

export const mediumOf = (publisher: string | null): Medium => (publisher && MANGA_PUBLISHERS.test(publisher) ? 'manga' : 'comic');

/** The five signals from what the catalog already knows. Only decisive fingerprint values become tags. */
export function tagsFromWork(w: Pick<CatalogWork, 'genres' | 'creators' | 'fingerprint' | 'completeness'>): { tags: Tags; artDriven: boolean } {
  const f = w.fingerprint ?? {};
  const tags = emptyTags();
  tags.genre = w.genres.map((g) => g.toLowerCase());
  tags.creator = w.creators.map((c) => c.toLowerCase());
  const tone: string[] = [];
  if (f.tone !== undefined) { if (f.tone >= 0.65) tone.push('dark'); else if (f.tone <= 0.35) tone.push('light'); }
  if (f.pace !== undefined) { if (f.pace >= 0.65) tone.push('fast-paced'); else if (f.pace <= 0.35) tone.push('slow-burn'); }
  if (f.complexity !== undefined && f.complexity >= 0.65) tone.push('dense');
  if (f.violence !== undefined && f.violence >= 0.65) tone.push('violent');
  if (f.mystery !== undefined && f.mystery >= 0.65) tone.push('mystery');
  tags.tone = tone;
  if (f.artForward !== undefined) { if (f.artForward >= 0.65) tags.art = ['art-forward']; else if (f.artForward <= 0.3) tags.art = ['text-driven']; }
  if (f.commitment !== undefined) tags.length = [f.commitment >= 0.7 ? 'epic' : f.commitment >= 0.4 ? 'long' : f.commitment >= 0.2 ? 'medium' : 'short'];
  return { tags, artDriven: (f.artForward ?? 0) >= 0.6 };
}

/** How long a run feels, for the length signal, when a database only gives a count. */
export const lengthTag = (volumesEquivalent: number): string => (volumesEquivalent <= 0 ? '' : volumesEquivalent <= 6 ? 'short' : volumesEquivalent <= 20 ? 'medium' : volumesEquivalent <= 60 ? 'long' : 'epic');

const IMPORTANCE: Record<string, Importance> = { required: 'required', strongly_recommended: 'helpful', useful_context: 'helpful', optional: 'optional', tie_in: 'optional' };

/** One catalog edge, seen from `thisId`. Edges run earlier → later, so the other end is a prequel or a sequel. */
export function relationFromEdge(edge: CatalogEdge, thisId: string, titles: Map<string, { title: string; completeness?: string }>): ExternalRelation | null {
  const otherId = edge.fromWork === thisId ? edge.toWork : edge.toWork === thisId ? edge.fromWork : null;
  if (!otherId) return null;
  const thisIsBefore = edge.fromWork === thisId;
  let importance: Importance = IMPORTANCE[edge.strength] ?? 'optional';
  // The catalog's edge type can make the link stronger than its strength label: a direct sequel is Required.
  if (edge.type === 'direct_sequel') importance = 'required';
  const kind: ExternalRelation['kind'] = importance === 'required' ? (thisIsBefore ? 'sequel' : 'prequel') : importance === 'helpful' ? 'side_story' : 'other';
  const confidence: Confidence = edge.confirmed ? 'verified' : 'ai_suggested';
  const t = titles.get(otherId);
  return { kind, externalId: otherId, title: t?.title ?? otherId, units: 1, status: 'unknown', importance, confidence, direction: thisIsBefore ? 'after' : 'before' };
}

export function externalFromWork(w: CatalogWork, edges: CatalogEdge[], titles: Map<string, { title: string }>): ExternalSeries {
  const { tags, artDriven } = tagsFromWork(w);
  return {
    source: 'local', externalId: w.id, title: w.title, altTitles: [], medium: mediumOf(w.publisher), status: w.completeness === 'ongoing' ? 'ongoing' : w.completeness === 'complete' ? 'finished' : 'unknown',
    units: 1, unitName: 'volumes', genres: w.genres, tags: [], creators: w.creators, description: w.summary ?? '', coverUrl: undefined, publisher: w.publisher ?? undefined,
    relations: edges.map((e) => relationFromEdge(e, w.id, titles)).filter((r): r is ExternalRelation => !!r),
    hints: { tags, artDriven },
  };
}
