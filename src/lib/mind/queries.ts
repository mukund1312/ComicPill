// Reads and small writes the screens and the digest need, straight on SQLite.
import { sqlite } from '../db/client';
import type { PrereqEdge, ReadStatus, Series } from './engine/types';
import type { RatingEvent } from './engine/tasteScorer';
import type { SeriesRow } from './model';
import { seriesFrom } from './sqliteStore';

type SerR = Parameters<typeof seriesFrom>[0];

export const listSeries = (): SeriesRow[] => sqlite.getAllSync<SerR>('SELECT * FROM ms_series WHERE stub = 0 ORDER BY COALESCE(found_at, created_at) DESC').map(seriesFrom);
export const getSeriesRow = (id: string): SeriesRow | null => { const r = sqlite.getFirstSync<SerR>('SELECT * FROM ms_series WHERE id = ?', id); return r ? seriesFrom(r) : null; };

export const setReadStatus = (id: string, status: ReadStatus): void => { sqlite.runSync('UPDATE ms_series SET read_status = ? WHERE id = ?', status, id); };
export const setPrintStatus = (id: string, print: string): void => { sqlite.runSync('UPDATE ms_series SET print_status = ? WHERE id = ?', print, id); };
export const setArtDriven = (id: string, v: boolean): void => { sqlite.runSync('UPDATE ms_series SET art_driven = ? WHERE id = ?', v ? 1 : 0, id); };

/** Every series (stubs included — they carry the titles) and every edge the reader hasn't called wrong. */
export function loadGraph(): { series: Map<string, Series>; edges: PrereqEdge[]; rows: Map<string, SeriesRow> } {
  const rows = new Map(sqlite.getAllSync<SerR>('SELECT * FROM ms_series').map((r) => { const s = seriesFrom(r); return [s.id, s] as const; }));
  const series = new Map([...rows].map(([id, r]) => [id, { id, title: r.title, units: r.units, year: r.year ?? undefined, status: r.readStatus } as Series]));
  const edges = sqlite.getAllSync<{ before_id: string; after_id: string; importance: string; confidence: string; wrong: number }>('SELECT * FROM ms_relations')
    .map((e): PrereqEdge => ({ before: e.before_id, after: e.after_id, importance: e.importance as PrereqEdge['importance'], confidence: e.confidence as PrereqEdge['confidence'], wrong: !!e.wrong }));
  return { series, edges, rows };
}

export const markRelationWrong = (before: string, after: string, wrong = true): void => {
  sqlite.runSync('UPDATE ms_relations SET wrong = ? WHERE before_id = ? AND after_id = ?', wrong ? 1 : 0, before, after);
};

export function relationsDetail(seriesId: string): Array<{ before: string; after: string; importance: string; confidence: string; note: string | null; wrong: boolean }> {
  return sqlite.getAllSync<{ before_id: string; after_id: string; importance: string; confidence: string; note: string | null; wrong: number }>('SELECT * FROM ms_relations WHERE before_id = ? OR after_id = ?', seriesId, seriesId)
    .map((r) => ({ before: r.before_id, after: r.after_id, importance: r.importance, confidence: r.confidence, note: r.note, wrong: !!r.wrong }));
}

/** Screenshots a series was found in. */
export function sourcesOf(seriesId: string): Array<{ uri: string; takenAt: number }> {
  return sqlite.getAllSync<{ uri: string; taken_at: number }>(
    'SELECT DISTINCT s.uri, s.taken_at FROM ms_captures c JOIN ms_screenshots s ON s.id = c.screenshot_id WHERE c.series_id = ? ORDER BY s.taken_at DESC', seriesId,
  ).map((r) => ({ uri: r.uri, takenAt: r.taken_at }));
}

// ---- ratings ----------------------------------------------------------------------------------------

export type RatingRow = { seriesId: string; rating: number; dropped: boolean; overrideScore: number | null; ratedAt: number };

export function rate(seriesId: string, rating: number, dropped = false): void {
  sqlite.runSync('INSERT INTO ms_ratings (series_id, rating, dropped, override_score, rated_at) VALUES (?, ?, ?, NULL, ?) ON CONFLICT(series_id) DO UPDATE SET rating = excluded.rating, dropped = excluded.dropped, rated_at = excluded.rated_at',
    seriesId, Math.max(1, Math.min(5, Math.round(rating))), dropped ? 1 : 0, Date.now());
  setReadStatus(seriesId, dropped ? 'dropped' : 'finished');
}

/** "I disagree": the reader sets the score themselves. Counts as a strong rating signal. */
export function setOverride(seriesId: string, score: number | null): void {
  const existing = sqlite.getFirstSync('SELECT 1 FROM ms_ratings WHERE series_id = ?', seriesId);
  if (existing) sqlite.runSync('UPDATE ms_ratings SET override_score = ? WHERE series_id = ?', score, seriesId);
  else if (score !== null) sqlite.runSync('INSERT INTO ms_ratings (series_id, rating, dropped, override_score, rated_at) VALUES (?, 3, 0, ?, ?)', seriesId, score, Date.now());
}

export const ratingOf = (seriesId: string): RatingRow | null => {
  const r = sqlite.getFirstSync<{ series_id: string; rating: number; dropped: number; override_score: number | null; rated_at: number }>('SELECT * FROM ms_ratings WHERE series_id = ?', seriesId);
  return r ? { seriesId: r.series_id, rating: r.rating, dropped: !!r.dropped, overrideScore: r.override_score, ratedAt: r.rated_at } : null;
};

export const ratedCount = (): number => sqlite.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM ms_ratings WHERE override_score IS NULL OR rating <> 3')?.n ?? 0;

export const listRatings = (): Array<RatingRow & { series: SeriesRow }> =>
  sqlite.getAllSync<{ series_id: string; rating: number; dropped: number; override_score: number | null; rated_at: number }>('SELECT * FROM ms_ratings ORDER BY rated_at DESC')
    .map((r) => ({ seriesId: r.series_id, rating: r.rating, dropped: !!r.dropped, overrideScore: r.override_score, ratedAt: r.rated_at, series: getSeriesRow(r.series_id)! })).filter((r) => r.series);

// ---- verdict overrides ("Not quite") -------------------------------------------------------------------

export const getVerdictOverrides = (seriesId: string): Record<string, unknown> | undefined => {
  const r = sqlite.getFirstSync<{ overrides_json: string }>('SELECT overrides_json FROM ms_verdict_overrides WHERE series_id = ?', seriesId);
  try { return r ? (JSON.parse(r.overrides_json) as Record<string, unknown>) : undefined; } catch { return undefined; }
};
export const saveVerdictOverrides = (seriesId: string, o: Record<string, unknown>): void => {
  sqlite.runSync('INSERT OR REPLACE INTO ms_verdict_overrides (series_id, overrides_json, updated_at) VALUES (?, ?, ?)', seriesId, JSON.stringify(o), Date.now());
};

// ---- digests ----------------------------------------------------------------------------------------

export const saveDigestJson = (week: string, json: string): void => {
  sqlite.runSync('INSERT INTO ms_digests (week, json, created_at) VALUES (?, ?, ?) ON CONFLICT(week) DO UPDATE SET json = excluded.json, created_at = excluded.created_at', week, json, Date.now());
};
export const listDigests = (): Array<{ week: string; json: string; createdAt: number; notifiedAt: number | null }> =>
  sqlite.getAllSync<{ week: string; json: string; created_at: number; notified_at: number | null }>('SELECT * FROM ms_digests ORDER BY week DESC LIMIT 26').map((r) => ({ week: r.week, json: r.json, createdAt: r.created_at, notifiedAt: r.notified_at }));

// ---- delete everything ----------------------------------------------------------------------------------

/** Removes every Mind Space row. The screenshots themselves are never touched — they are the reader's, in their gallery. */
export function deleteAllMindData(): void {
  for (const t of ['ms_screenshots', 'ms_captures', 'ms_series', 'ms_relations', 'ms_ratings', 'ms_verdict_overrides', 'ms_digests', 'ms_cache']) sqlite.runSync(`DELETE FROM ${t}`);
}

export function counts(): { screenshots: number; series: number; ratings: number } {
  const n = (t: string) => sqlite.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)?.n ?? 0;
  return { screenshots: n('ms_screenshots'), series: n('ms_series WHERE stub = 0'), ratings: n('ms_ratings') };
}

export { type RatingEvent };
