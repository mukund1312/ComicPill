// An in-memory MindStore for tests. Behaves like the SQLite one: same stub rules, same cache ageing,
// and a "looks wrong" flag that survives re-enrichment.
import type { CaptureRow, RelationRow, SeriesInput, SeriesRow, ShotRow } from './model';
import type { MindStore } from './store';

export function memoryStore(clock: () => number = Date.now): MindStore & { dump(): { shots: ShotRow[]; captures: CaptureRow[]; series: SeriesRow[]; relations: RelationRow[] }; flagWrong(before: string, after: string): void } {
  const shots = new Map<string, ShotRow>(); const captures = new Map<string, CaptureRow>(); const series = new Map<string, SeriesRow>();
  const relations = new Map<string, RelationRow>(); const cache = new Map<string, { json: string; at: number }>();
  let n = 0; const uid = () => `id${++n}`;
  return {
    addScreenshots(rows) {
      let added = 0;
      for (const r of rows) {
        if ([...shots.values()].some((s) => s.assetId === r.assetId)) continue;
        const id = uid(); shots.set(id, { id, assetId: r.assetId, uri: r.uri, takenAt: r.takenAt, addedAt: clock(), status: 'new', gate: null, gateReason: null, ocrText: null, error: null, summary: null }); added++;
      }
      return added;
    },
    getScreenshot: (id) => shots.get(id) ?? null,
    listScreenshots: () => [...shots.values()].sort((a, b) => b.takenAt - a.takenAt),
    updateScreenshot(id, p) { const s = shots.get(id); if (s) shots.set(id, { ...s, ...p }); },
    addCapture(c) { const id = uid(); captures.set(id, { ...c, id, createdAt: clock() }); return id; },
    getCapture: (id) => captures.get(id) ?? null,
    updateCapture(id, p) { const c = captures.get(id); if (c) captures.set(id, { ...c, ...p }); },
    listCaptures: (sid) => [...captures.values()].filter((c) => c.screenshotId === sid),
    deleteCaptures(sid) { for (const [id, c] of captures) if (c.screenshotId === sid) captures.delete(id); },
    getSeries: (id) => series.get(id) ?? null,
    findSeriesByTitle: (t) => [...series.values()].filter((s) => !s.stub && s.title.toLowerCase().includes(t.toLowerCase())),
    upsertSeries(s: SeriesInput) {
      const existing = series.get(s.id);
      if (existing && s.stub) return s.id;
      series.set(s.id, { ...s, readStatus: existing?.readStatus ?? 'planned', createdAt: existing?.createdAt ?? clock(), foundAt: existing?.foundAt ?? null });
      return s.id;
    },
    markFound(id, at) { const s = series.get(id); if (s) series.set(id, { ...s, foundAt: at }); },
    upsertRelation(r) {
      const key = `${r.before}>${r.after}`; const old = relations.get(key);
      relations.set(key, { before: r.before, after: r.after, importance: r.importance, confidence: r.confidence, note: r.note ?? null, wrong: old?.wrong ?? false });
    },
    relationsOf: (id) => [...relations.values()].filter((r) => r.before === id || r.after === id),
    getCache(key, maxAge) { const c = cache.get(key); return c && clock() - c.at <= maxAge ? c.json : null; },
    setCache(key, json) { cache.set(key, { json, at: clock() }); },
    dump: () => ({ shots: [...shots.values()], captures: [...captures.values()], series: [...series.values()], relations: [...relations.values()] }),
    flagWrong(before, after) { const r = relations.get(`${before}>${after}`); if (r) relations.set(`${before}>${after}`, { ...r, wrong: true }); },
  };
}
