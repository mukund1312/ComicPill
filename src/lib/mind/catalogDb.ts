// The SQLite side of the catalog bridge: find books by title, and hydrate one with its story edges.
import { sqlite } from '../db/client';
import { titleScore } from '../scan/match';
import { externalFromWork, type CatalogEdge, type CatalogWork } from './catalogBridge';
import type { ExternalSeries } from './remote/types';

type WorkRow = { id: string; title: string; publisher: string | null; genres: string; creators: string; fingerprint: string | null; completeness: string; summary: string | null; cover_path: string | null };
const parse = <T,>(s: string | null, f: T): T => { try { return s ? (JSON.parse(s) as T) : f; } catch { return f; } };
const toWork = (r: WorkRow): CatalogWork => ({ id: r.id, title: r.title, publisher: r.publisher, genres: parse(r.genres, []), creators: parse(r.creators, []), fingerprint: parse(r.fingerprint, null), completeness: r.completeness, summary: r.summary, coverPath: r.cover_path });

let titleCache: Array<{ id: string; title: string }> | null = null;
const allTitles = () => (titleCache ??= sqlite.getAllSync<{ id: string; title: string }>('SELECT id, title FROM works'));

export function hydrateWork(id: string): ExternalSeries | null {
  const row = sqlite.getFirstSync<WorkRow>('SELECT * FROM works WHERE id = ?', id);
  if (!row) return null;
  const edges = sqlite.getAllSync<{ from_work: string; to_work: string; type: string; strength: string; confirmed: number }>('SELECT * FROM story_edges WHERE from_work = ? OR to_work = ?', id, id)
    .map((e): CatalogEdge => ({ fromWork: e.from_work, toWork: e.to_work, type: e.type, strength: e.strength, confirmed: !!e.confirmed }));
  const titles = new Map(allTitles().map((t) => [t.id, { title: t.title }]));
  return externalFromWork(toWork(row), edges, titles);
}

/** Best catalog matches for a title read off a screenshot. */
export function searchCatalog(title: string, limit = 4): ExternalSeries[] {
  const scored = allTitles().map((t) => ({ id: t.id, s: titleScore(title, null, t.title) })).filter((x) => x.s >= 0.5).sort((a, b) => b.s - a.s).slice(0, limit);
  return scored.map((x) => hydrateWork(x.id)).filter((s): s is ExternalSeries => !!s);
}

/** Well-known, widely-read titles across genres for the first-run quiz. */
export function quizCandidates(limit = 40): ExternalSeries[] {
  const rows = sqlite.getAllSync<WorkRow>('SELECT * FROM works WHERE keeper_flag = 1 ORDER BY title LIMIT ?', 400);
  const byGenre = new Map<string, WorkRow[]>();
  for (const r of rows) { const g = parse<string[]>(r.genres, [])[0] ?? 'other'; byGenre.set(g, [...(byGenre.get(g) ?? []), r]); }
  const out: WorkRow[] = [];
  let i = 0;
  while (out.length < limit && [...byGenre.values()].some((l) => l.length > i)) { for (const l of byGenre.values()) if (l[i] && out.length < limit) out.push(l[i]); i++; }
  return out.map((r) => hydrateWork(r.id)).filter((s): s is ExternalSeries => !!s);
}
