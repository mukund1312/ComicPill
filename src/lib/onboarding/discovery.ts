// The "you tapped one, here are a few more" engine behind taste onboarding.
//
// After each selection it proposes 2-4 NEW choices:
//   ~50% related   (walk the relationship graph from what's selected)
//   ~30% diverse   (popular, and different from what's already on screen)
//   ~20% explore   (a seeded pick from the long tail)
// so a Batman fan is offered Nightwing and Joker, but never a page of nothing
// but Gotham. Pure and deterministic: the same inputs and seed always give the
// same choices, which makes it testable and the UI stable across re-renders.
import type { Entity } from './entities';

export interface Neighbour { id: string; strength: number }

export interface DiscoveryInput {
  /** Everything that may be offered in this step. */
  pool: readonly Entity[];
  /** Related entities of one entity (both directions already merged). */
  relate: (id: string) => Neighbour[];
  /** Selected ids, in the order they were picked. */
  selected: readonly string[];
  /** Every id ever shown in this step (so nothing is offered twice). */
  shown: ReadonlySet<string>;
  /** Ids currently on screen and unselected. */
  visible: readonly string[];
  seed: number;
}

/** No more than this many un-picked choices are ever on screen at once. */
export const MAX_VISIBLE_UNSELECTED = 16;
export const MIN_ADD = 2;
export const MAX_ADD = 4;

const RECENT_WEIGHT = 1.0; // the entity just tapped counts most
const EARLIER_WEIGHT = 0.6; // earlier picks still pull, less

/** Small stable hash -> [0,1). Not cryptographic; just repeatable. */
export function seededUnit(seed: number, id: string): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < id.length; i += 1) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

const publisherOf = (e: Entity): string => (e.kind === 'character' ? e.publisher : 'creator');

function relatedScores(input: DiscoveryInput, justSelected: string | null): Map<string, number> {
  const score = new Map<string, number>();
  for (const sel of input.selected) {
    const w = sel === justSelected ? RECENT_WEIGHT : EARLIER_WEIGHT;
    for (const n of input.relate(sel)) score.set(n.id, (score.get(n.id) ?? 0) + n.strength * w);
  }
  return score;
}

/** How many of each kind for a batch of `want` new choices. */
export function quotas(want: number): { related: number; diverse: number; explore: number } {
  const related = Math.ceil(want * 0.5);
  const diverse = Math.round(want * 0.3);
  return { related, diverse, explore: Math.max(0, want - related - diverse) };
}

/** The opening screen: the most popular choices, but spread across publishers
 *  so it never opens as one universe. `prefer` lets a step bias the order
 *  (e.g. villains who are enemies of the chosen heroes come first). */
export function initialChoices(pool: readonly Entity[], count: number, prefer: (e: Entity) => number = () => 0): string[] {
  const ranked = [...pool].sort((a, b) => (prefer(b) - prefer(a)) || (b.popularity - a.popularity) || a.id.localeCompare(b.id));
  const out: Entity[] = [];
  const perPublisher = new Map<string, number>();
  const cap = Math.max(2, Math.ceil(count * 0.6));
  for (const e of ranked) {
    if (out.length >= count) break;
    const pub = publisherOf(e);
    if ((perPublisher.get(pub) ?? 0) >= cap) continue;
    out.push(e);
    perPublisher.set(pub, (perPublisher.get(pub) ?? 0) + 1);
  }
  for (const e of ranked) { if (out.length >= count) break; if (!out.includes(e)) out.push(e); }
  return out.map((e) => e.id);
}

export interface DiscoveryResult { add: string[]; retire: string[] }

/** What to bring in after `justSelected` was tapped, and what to quietly retire. */
export function nextChoices(input: DiscoveryInput, justSelected: string, want = 3): DiscoveryResult {
  const n = Math.min(MAX_ADD, Math.max(MIN_ADD, want));
  const selected = new Set(input.selected);
  const available = input.pool.filter((e) => !input.shown.has(e.id) && !selected.has(e.id));
  const rel = relatedScores(input, justSelected);
  const chosen: Entity[] = [];
  const take = (list: Entity[], k: number) => {
    for (const e of list) { if (k <= 0) break; if (!chosen.includes(e)) { chosen.push(e); k -= 1; } }
  };
  const q = quotas(n);

  // 1) related: strongest ties to what's selected
  const related = available.filter((e) => (rel.get(e.id) ?? 0) > 0)
    .sort((a, b) => (rel.get(b.id)! - rel.get(a.id)!) || (b.popularity - a.popularity) || a.id.localeCompare(b.id));
  take(related, q.related);

  // 2) diverse: popular, preferring a publisher/universe not already on screen and NOT tied to the picks
  const onScreenPublishers = new Map<string, number>();
  for (const id of [...input.visible, ...input.selected]) {
    const e = input.pool.find((x) => x.id === id);
    if (e) onScreenPublishers.set(publisherOf(e), (onScreenPublishers.get(publisherOf(e)) ?? 0) + 1);
  }
  const diverse = available.filter((e) => !chosen.includes(e))
    .sort((a, b) => {
      const va = (b.popularity - (rel.get(b.id) ?? 0) * 0.3) - 0.15 * (onScreenPublishers.get(publisherOf(b)) ?? 0);
      const vb = (a.popularity - (rel.get(a.id) ?? 0) * 0.3) - 0.15 * (onScreenPublishers.get(publisherOf(a)) ?? 0);
      return (va - vb) || a.id.localeCompare(b.id);
    });
  take(diverse, q.diverse);

  // 3) explore: a seeded pick from the long tail (below-median popularity)
  const pops = input.pool.map((e) => e.popularity).sort((a, b) => a - b);
  const median = pops[Math.floor(pops.length / 2)] ?? 0.5;
  const tail = available.filter((e) => !chosen.includes(e) && e.popularity <= median)
    .sort((a, b) => (seededUnit(input.seed, a.id) - seededUnit(input.seed, b.id)) || a.id.localeCompare(b.id));
  take(tail, q.explore);

  // Backfill if a bucket ran short: related, then popular, then anything left.
  const rest = available.filter((e) => !chosen.includes(e))
    .sort((a, b) => ((rel.get(b.id) ?? 0) - (rel.get(a.id) ?? 0)) || (b.popularity - a.popularity) || a.id.localeCompare(b.id));
  take(rest, n - chosen.length);

  const add = chosen.slice(0, n).map((e) => e.id);

  // Keep the screen from growing forever: retire the least relevant un-picked
  // choices (never selected ones, never ones we just added).
  const total = input.visible.length + add.length;
  const overflow = Math.max(0, total - MAX_VISIBLE_UNSELECTED);
  const keepScore = (id: string) => {
    const e = input.pool.find((x) => x.id === id);
    return (rel.get(id) ?? 0) + (e?.popularity ?? 0) * 0.3;
  };
  const retire = [...input.visible].sort((a, b) => keepScore(a) - keepScore(b) || a.localeCompare(b)).slice(0, overflow);
  return { add, retire };
}

// ---- search --------------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Match by name or alias: exact > name prefix > word prefix > contains. */
export function searchEntities(query: string, pool: readonly Entity[], limit = 8): Entity[] {
  const q = norm(query);
  if (!q) return [];
  const scored: { e: Entity; s: number }[] = [];
  for (const e of pool) {
    const names = [e.name, ...(e.kind === 'character' ? e.aliases ?? [] : [])].map(norm);
    let best = 0;
    for (const nm of names) {
      if (nm === q) best = Math.max(best, 100);
      else if (nm.startsWith(q)) best = Math.max(best, 80);
      else if (nm.split(' ').some((w) => w.startsWith(q))) best = Math.max(best, 60);
      else if (nm.includes(q)) best = Math.max(best, 40);
    }
    if (best > 0) scored.push({ e, s: best + e.popularity });
  }
  return scored.sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name)).slice(0, limit).map((x) => x.e);
}

// ---- restoring a screen -----------------------------------------------------------

export interface RebuildInput {
  pool: readonly Entity[];
  relate: (id: string) => Neighbour[];
  /** Picks so far, in order. */
  selected: readonly string[];
  seed: number;
  initialCount?: number;
  prefer?: (e: Entity) => number;
  want?: number;
}

/** Replay the picks from the opening screen, exactly as the taps would have
 *  happened. Used both to open a step and to resume it after a relaunch, so the
 *  choices on screen come back identical. A pick that was never on screen was
 *  found with search, which counts as shown. */
export function rebuildStep(input: RebuildInput): { visible: string[]; shown: Set<string> } {
  let visible = initialChoices(input.pool, input.initialCount ?? 9, input.prefer);
  const shown = new Set(visible);
  const picked: string[] = [];
  for (const pick of input.selected) {
    if (!input.pool.some((e) => e.id === pick)) continue;
    if (!visible.includes(pick)) { visible = [...visible, pick]; shown.add(pick); }
    picked.push(pick);
    visible = visible.filter((id) => id !== pick);
    const r = nextChoices({ pool: input.pool, relate: input.relate, selected: picked, shown, visible, seed: input.seed }, pick, input.want ?? 3);
    r.add.forEach((id) => shown.add(id));
    visible = visible.filter((id) => !r.retire.includes(id)).concat(r.add);
  }
  return { visible, shown };
}
