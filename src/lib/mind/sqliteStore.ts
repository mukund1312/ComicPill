import { sqlite } from '../db/client';
import type { CaptureRow, MatchOption, RelationRow, SeriesInput, SeriesRow, ShotRow } from './model';
import type { MindStore } from './store';
import { emptyTags, type Tags } from './engine/tasteScorer';

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const j = <T,>(s: string | null | undefined, fallback: T): T => { try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; } };

type ShotR = { id: string; asset_id: string; uri: string; taken_at: number; added_at: number; status: string; gate: string | null; gate_reason: string | null; ocr_text: string | null; error: string | null; summary: string | null };
const shot = (r: ShotR): ShotRow => ({ id: r.id, assetId: r.asset_id, uri: r.uri, takenAt: r.taken_at, addedAt: r.added_at, status: r.status as ShotRow['status'], gate: r.gate as ShotRow['gate'], gateReason: r.gate_reason, ocrText: r.ocr_text, error: r.error, summary: r.summary });

type CapR = { id: string; screenshot_id: string; title: string; title_conf: string; creators_json: string; medium: string; status: string; series_id: string | null; options_json: string | null; created_at: number };
const cap = (r: CapR): CaptureRow => ({ id: r.id, screenshotId: r.screenshot_id, title: r.title, titleConf: r.title_conf, creators: j(r.creators_json, []), medium: r.medium as CaptureRow['medium'], status: r.status as CaptureRow['status'], seriesId: r.series_id, options: j<MatchOption[] | null>(r.options_json, null), createdAt: r.created_at });

type SerR = { id: string; source: string; external_id: string; title: string; medium: string; year: number | null; run_status: string; units: number; unit_name: string; tags_json: string; creators_json: string; description: string; cover_url: string | null; publisher: string | null; art_driven: number; print_status: string; price_rising: number; verified: number; stub: number; judged: number; read_status: string; created_at: number; found_at: number | null };
export const seriesFrom = (r: SerR): SeriesRow => ({
  id: r.id, source: r.source as SeriesRow['source'], externalId: r.external_id, title: r.title, medium: r.medium as SeriesRow['medium'], year: r.year,
  runStatus: r.run_status as SeriesRow['runStatus'], units: r.units, unitName: r.unit_name as SeriesRow['unitName'], tags: { ...emptyTags(), ...j<Partial<Tags>>(r.tags_json, {}) },
  creators: j(r.creators_json, []), description: r.description, coverUrl: r.cover_url, publisher: r.publisher, artDriven: !!r.art_driven, printStatus: r.print_status as SeriesRow['printStatus'],
  priceRising: !!r.price_rising, verified: !!r.verified, stub: !!r.stub, judged: !!r.judged, readStatus: r.read_status as SeriesRow['readStatus'], createdAt: r.created_at, foundAt: r.found_at,
});

export const sqliteStore: MindStore = {
  addScreenshots(rows) {
    let n = 0;
    for (const r of rows) {
      const res = sqlite.runSync('INSERT OR IGNORE INTO ms_screenshots (id, asset_id, uri, taken_at, added_at) VALUES (?, ?, ?, ?, ?)', uid(), r.assetId, r.uri, r.takenAt, Date.now());
      n += res.changes;
    }
    return n;
  },
  getScreenshot: (id) => { const r = sqlite.getFirstSync<ShotR>('SELECT * FROM ms_screenshots WHERE id = ?', id); return r ? shot(r) : null; },
  listScreenshots: () => sqlite.getAllSync<ShotR>('SELECT * FROM ms_screenshots ORDER BY taken_at DESC').map(shot),
  updateScreenshot(id, p) {
    const sets: string[] = []; const vals: Array<string | number | null> = [];
    const col: Record<string, string> = { status: 'status', gate: 'gate', gateReason: 'gate_reason', ocrText: 'ocr_text', error: 'error', summary: 'summary' };
    for (const [k, v] of Object.entries(p)) { sets.push(`${col[k]} = ?`); vals.push(v as string | null); }
    if (sets.length) sqlite.runSync(`UPDATE ms_screenshots SET ${sets.join(', ')} WHERE id = ?`, ...vals, id);
  },

  addCapture(c) {
    const id = uid();
    sqlite.runSync('INSERT INTO ms_captures (id, screenshot_id, title, title_conf, creators_json, medium, status, series_id, options_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, c.screenshotId, c.title, c.titleConf, JSON.stringify(c.creators), c.medium, c.status, c.seriesId, c.options ? JSON.stringify(c.options) : null, Date.now());
    return id;
  },
  getCapture: (id) => { const r = sqlite.getFirstSync<CapR>('SELECT * FROM ms_captures WHERE id = ?', id); return r ? cap(r) : null; },
  updateCapture(id, p) {
    if (p.status !== undefined) sqlite.runSync('UPDATE ms_captures SET status = ? WHERE id = ?', p.status, id);
    if (p.seriesId !== undefined) sqlite.runSync('UPDATE ms_captures SET series_id = ? WHERE id = ?', p.seriesId, id);
    if (p.options !== undefined) sqlite.runSync('UPDATE ms_captures SET options_json = ? WHERE id = ?', p.options ? JSON.stringify(p.options) : null, id);
    if (p.title !== undefined) sqlite.runSync('UPDATE ms_captures SET title = ? WHERE id = ?', p.title, id);
  },
  deleteCaptures: (sid) => { sqlite.runSync('DELETE FROM ms_captures WHERE screenshot_id = ?', sid); },
  listCaptures: (sid) => sqlite.getAllSync<CapR>('SELECT * FROM ms_captures WHERE screenshot_id = ? ORDER BY created_at', sid).map(cap),

  getSeries: (id) => { const r = sqlite.getFirstSync<SerR>('SELECT * FROM ms_series WHERE id = ?', id); return r ? seriesFrom(r) : null; },
  findSeriesByTitle(title) {
    return sqlite.getAllSync<SerR>('SELECT * FROM ms_series WHERE stub = 0 AND title LIKE ? COLLATE NOCASE LIMIT 20', `%${title.replace(/[%_]/g, '')}%`).map(seriesFrom);
  },
  upsertSeries(s) {
    const existing = sqlite.getFirstSync<{ stub: number }>('SELECT stub FROM ms_series WHERE id = ?', s.id);
    if (existing && s.stub) return s.id; // a stub never overwrites what we already know
    const vals = [s.source, s.externalId, s.title, s.medium, s.year, s.runStatus, s.units, s.unitName, JSON.stringify(s.tags), JSON.stringify(s.creators), s.description, s.coverUrl, s.publisher, s.artDriven ? 1 : 0, s.printStatus, s.priceRising ? 1 : 0, s.verified ? 1 : 0, s.stub ? 1 : 0, s.judged ? 1 : 0] as const;
    if (existing) {
      sqlite.runSync('UPDATE ms_series SET source=?, external_id=?, title=?, medium=?, year=?, run_status=?, units=?, unit_name=?, tags_json=?, creators_json=?, description=?, cover_url=?, publisher=?, art_driven=?, print_status=?, price_rising=?, verified=?, stub=?, judged=? WHERE id = ?', ...vals, s.id);
    } else {
      sqlite.runSync('INSERT INTO ms_series (source, external_id, title, medium, year, run_status, units, unit_name, tags_json, creators_json, description, cover_url, publisher, art_driven, print_status, price_rising, verified, stub, judged, id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', ...vals, s.id, Date.now());
    }
    return s.id;
  },
  markFound: (id, at) => { sqlite.runSync('UPDATE ms_series SET found_at = ? WHERE id = ?', at, id); },

  upsertRelation(r) {
    // Re-enriching a series must never un-flag something the reader said looks wrong.
    sqlite.runSync(
      'INSERT INTO ms_relations (before_id, after_id, importance, confidence, note, wrong, created_at) VALUES (?, ?, ?, ?, ?, 0, ?) ON CONFLICT(before_id, after_id) DO UPDATE SET importance = excluded.importance, confidence = excluded.confidence, note = excluded.note',
      r.before, r.after, r.importance, r.confidence, r.note ?? null, Date.now());
  },
  relationsOf: (id) => sqlite.getAllSync<{ before_id: string; after_id: string; importance: string; confidence: string; note: string | null; wrong: number }>('SELECT * FROM ms_relations WHERE before_id = ? OR after_id = ?', id, id)
    .map((r): RelationRow => ({ before: r.before_id, after: r.after_id, importance: r.importance as RelationRow['importance'], confidence: r.confidence as RelationRow['confidence'], note: r.note, wrong: !!r.wrong })),

  getCache(key, maxAgeMs) {
    const r = sqlite.getFirstSync<{ json: string; fetched_at: number }>('SELECT json, fetched_at FROM ms_cache WHERE key = ?', key);
    return r && Date.now() - r.fetched_at <= maxAgeMs ? r.json : null;
  },
  setCache: (key, json) => { sqlite.runSync('INSERT OR REPLACE INTO ms_cache (key, json, fetched_at) VALUES (?, ?, ?)', key, json, Date.now()); },
};
