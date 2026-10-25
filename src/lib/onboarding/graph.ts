// Turns the curated character relationships, and the catalog's own creator
// credits, into the "who is related to whom" lookups discovery walks.
import type { CharacterEntity, CreatorEntity, Relationship } from './entities';
import type { Neighbour } from './discovery';

/** Character neighbours, both directions of every relationship. */
export function characterGraph(relationships: readonly Relationship[]): (id: string) => Neighbour[] {
  const adj = new Map<string, Neighbour[]>();
  const add = (a: string, b: string, s: number) => { const list = adj.get(a) ?? []; list.push({ id: b, strength: s }); adj.set(a, list); };
  for (const r of relationships) { add(r.from, r.to, r.strength); add(r.to, r.from, r.strength); }
  return (id) => adj.get(id) ?? [];
}

export interface WorkFacts { id: string; characters: readonly string[]; genres: readonly string[]; creators: readonly string[]; publisher: string }

/** Creator similarity from the catalog, never invented: two creators are close
 *  when the books they are credited on share characters, genres and publisher
 *  (cosine over those counts), with a bonus for direct collaboration. */
export function creatorGraph(creators: readonly CreatorEntity[], works: readonly WorkFacts[], perCreator = 6): (id: string) => Neighbour[] {
  const vec = new Map<string, Map<string, number>>();
  for (const c of creators) {
    const v = new Map<string, number>();
    for (const w of works.filter((x) => x.creators.includes(c.name))) {
      for (const ch of w.characters) v.set(`c:${ch}`, (v.get(`c:${ch}`) ?? 0) + 1);
      for (const g of w.genres) v.set(`g:${g}`, (v.get(`g:${g}`) ?? 0) + 0.5);
      v.set(`p:${w.publisher}`, (v.get(`p:${w.publisher}`) ?? 0) + 0.5);
    }
    vec.set(c.id, v);
  }
  const dot = (a: Map<string, number>, b: Map<string, number>) => { let s = 0; for (const [k, x] of a) s += x * (b.get(k) ?? 0); return s; };
  const norm = (a: Map<string, number>) => Math.sqrt(dot(a, a));
  const collab = (a: CreatorEntity, b: CreatorEntity) => works.filter((w) => w.creators.includes(a.name) && w.creators.includes(b.name)).length;

  const out = new Map<string, Neighbour[]>();
  for (const a of creators) {
    const va = vec.get(a.id)!;
    const list: Neighbour[] = [];
    for (const b of creators) {
      if (a.id === b.id) continue;
      const na = norm(va) * norm(vec.get(b.id)!);
      const cos = na ? dot(va, vec.get(b.id)!) / na : 0;
      const strength = Math.min(1, cos * 0.85 + Math.min(0.3, collab(a, b) * 0.1));
      if (strength > 0.12) list.push({ id: b.id, strength });
    }
    out.set(a.id, list.sort((x, y) => y.strength - x.strength || x.id.localeCompare(y.id)).slice(0, perCreator));
  }
  // Symmetric, so "related to" reads the same from either side.
  for (const [a, list] of [...out]) for (const n of list) {
    const back = out.get(n.id) ?? [];
    if (!back.some((x) => x.id === a)) back.push({ id: a, strength: n.strength });
    out.set(n.id, back);
  }
  return (id) => out.get(id) ?? [];
}

export type { CharacterEntity };
