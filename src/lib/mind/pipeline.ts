// Screenshot → capture → series → relations. Every outside thing (OCR, image prep, the AI, the comic
// databases, the clock) is passed in, so the whole flow — including offline queueing, rate limits and
// ambiguous titles — is tested without a phone.
import type { RunOptions } from '../ai/client';
import type { AiConfig } from '../ai/types';
import { gateScreenshot } from './capture/ocrFilter';
import { lengthTag } from './catalogBridge';
import { emptyTags, type Tags } from './engine/tasteScorer';
import { seriesId, type CaptureRow, type SeriesInput } from './model';
import { extractCaptures, isReadable, type Candidate } from './remote/extract';
import { judgeSeries } from './remote/judge';
import { searchAniList } from './remote/anilist';
import { searchComicVine } from './remote/comicvine';
import { decideMatch, rankCandidates, type Ranked } from './remote/matcher';
import { defaultImportance, LookupError, orderOf, type ExternalSeries, type FetchLike, type Medium } from './remote/types';
import type { MindStore } from './store';

export type Deps = {
  store: MindStore;
  ai: AiConfig | null;
  aiOptions?: RunOptions;
  comicVineKey: string | null;
  fetchImpl?: FetchLike;
  /** Best local-catalog matches for a title (no network). */
  searchLocal(title: string): ExternalSeries[];
  /** Local-catalog record by id, to hydrate a chosen option. */
  prepare(uri: string): Promise<string | null>;
  /** On-device text. null = this phone can't read text. */
  ocr(uri: string): Promise<string | null>;
  now(): number;
};

const DAY = 24 * 60 * 60 * 1000;
const CACHE_TTL = 30 * DAY;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ---- step 1: the phone looks first -------------------------------------------------------------------

/** OCR on the phone, then the privacy gate. Nothing here leaves the device. */
export async function gateNewScreenshot(shotId: string, deps: Deps, autoSend: boolean): Promise<void> {
  const shot = deps.store.getScreenshot(shotId);
  if (!shot || shot.status !== 'new') return;
  let text: string | null = null;
  try { text = await deps.ocr(shot.uri); } catch { text = null; }
  if (text === null) {
    // Can't check the text on this phone: never send on its own, always ask.
    deps.store.updateScreenshot(shotId, { status: 'awaiting_approval', gate: 'maybe', gateReason: 'This phone couldn’t check the text first — review before sending.' });
    return;
  }
  const g = gateScreenshot(text);
  if (g.gate === 'sensitive') { deps.store.updateScreenshot(shotId, { status: 'sensitive', gate: 'sensitive', gateReason: g.reason, ocrText: null }); return; }
  if (g.gate === 'skip') { deps.store.updateScreenshot(shotId, { status: 'skipped', gate: 'skip', gateReason: g.reason, ocrText: null }); return; }
  deps.store.updateScreenshot(shotId, { status: autoSend ? 'queued' : 'awaiting_approval', gate: g.gate, gateReason: g.reason, ocrText: text.slice(0, 2000) });
}

export function approveScreenshots(ids: string[], store: MindStore): void {
  for (const id of ids) if (store.getScreenshot(id)?.status === 'awaiting_approval') store.updateScreenshot(id, { status: 'queued', error: null });
}
export function dismissScreenshot(id: string, store: MindStore): void { store.updateScreenshot(id, { status: 'skipped', ocrText: null }); }

// ---- lookups, cached ---------------------------------------------------------------------------------

async function cachedLookup(deps: Deps, source: 'anilist' | 'comicvine', title: string, run: () => Promise<ExternalSeries[]>): Promise<ExternalSeries[]> {
  const key = `${source}:${norm(title)}`;
  const hit = deps.store.getCache(key, CACHE_TTL);
  if (hit) { try { return JSON.parse(hit) as ExternalSeries[]; } catch { /* fall through and refetch */ } }
  const fresh = await run();
  deps.store.setCache(key, JSON.stringify(fresh));
  return fresh;
}

/** Local catalog first (free, verified), then the database for the medium. Throws LookupError for network trouble. */
export async function findCandidates(title: string, medium: Medium, deps: Deps): Promise<ExternalSeries[]> {
  const out: ExternalSeries[] = [...deps.searchLocal(title)];
  if (medium === 'manga' || medium === 'unknown') out.push(...await cachedLookup(deps, 'anilist', title, () => searchAniList(title, deps.fetchImpl)));
  if (medium !== 'manga' && deps.comicVineKey) {
    try { out.push(...await cachedLookup(deps, 'comicvine', title, () => searchComicVine(title, deps.comicVineKey, deps.fetchImpl))); }
    catch (e) { if (!(e instanceof LookupError) || e.kind === 'network' || e.kind === 'rate_limited') throw e; /* a bad key shouldn't block everything else */ }
  }
  return out;
}

// ---- enrichment --------------------------------------------------------------------------------------

function baseTags(ext: ExternalSeries): Tags {
  const t = emptyTags();
  t.genre = [...new Set([...ext.genres, ...ext.tags].map((g) => g.toLowerCase()))];
  t.creator = ext.creators.map((c) => c.toLowerCase());
  const volumesEquivalent = ext.unitName === 'issues' ? ext.units / 6 : ext.units;
  const len = lengthTag(volumesEquivalent); if (len) t.length = [len];
  return ext.hints?.tags ? { ...t, ...Object.fromEntries(Object.entries(ext.hints.tags).filter(([, v]) => v && v.length)) } as Tags : t;
}

const toInput = (ext: ExternalSeries, over: Partial<SeriesInput> = {}): SeriesInput => ({
  id: seriesId(ext.source, ext.externalId), source: ext.source, externalId: ext.externalId, title: ext.title, medium: ext.medium, year: ext.year ?? null,
  runStatus: ext.status, units: ext.units, unitName: ext.unitName, tags: baseTags(ext), creators: ext.creators, description: ext.description, coverUrl: ext.coverUrl ?? (ext.source === 'local' ? `local:${ext.externalId}` : null),
  publisher: ext.publisher ?? null, artDriven: ext.hints?.artDriven ?? false, printStatus: 'unknown', priceRising: false, verified: ext.source !== 'ai', stub: false, judged: false, ...over,
});

export type EnrichResult = { id: string; aiError?: string; networkDown?: boolean };

/** Make a matched series real: details, relations (Verified), and — once per series — the AI's tags and relation weights. */
export async function enrichSeries(ext: ExternalSeries, deps: Deps, foundAt: number): Promise<EnrichResult> {
  const { store } = deps;
  const id = seriesId(ext.source, ext.externalId);
  const existing = store.getSeries(id);
  if (existing && !existing.stub && existing.judged) { store.markFound(id, foundAt); return { id }; } // one lookup per series, however many screenshots

  const needsAi = ext.source !== 'local';
  store.upsertSeries(toInput(ext, { judged: !needsAi }));
  store.markFound(id, foundAt);

  for (const rel of ext.relations) {
    const order = orderOf(id, { ...rel, externalId: seriesId(ext.source, rel.externalId) });
    if (!order) continue;
    store.upsertSeries({
      id: seriesId(ext.source, rel.externalId), source: ext.source, externalId: rel.externalId, title: rel.title, medium: ext.medium, year: rel.year ?? null,
      runStatus: rel.status, units: rel.units, unitName: ext.unitName, tags: emptyTags(), creators: [], description: '', coverUrl: null, publisher: null,
      artDriven: false, printStatus: 'unknown', priceRising: false, verified: true, stub: true, judged: false,
    });
    store.upsertRelation({ before: order.before, after: order.after, importance: rel.importance ?? defaultImportance(rel.kind), confidence: rel.confidence ?? 'verified' });
  }
  if (!needsAi) return { id };

  const judged = await judgeSeries(deps.ai, ext, deps.aiOptions);
  if (!judged.ok) return { id, aiError: judged.message, networkDown: judged.kind === 'network' };
  const j = judged.data;
  const tags = baseTags(ext);
  tags.genre = [...new Set([...tags.genre, ...j.genre])]; tags.tone = j.tone; tags.art = j.art;
  store.upsertSeries(toInput(ext, { tags, artDriven: j.artDriven, runStatus: ext.status !== 'unknown' ? ext.status : j.runStatus, judged: true }));

  // The AI may only re-weigh relations the database stated.
  for (const r of j.relations) {
    const rel = ext.relations.find((x) => x.externalId === r.externalId); if (!rel) continue;
    const order = orderOf(id, { ...rel, externalId: seriesId(ext.source, rel.externalId) }); if (!order) continue;
    store.upsertRelation({ before: order.before, after: order.after, importance: r.importance, confidence: 'verified', note: r.why });
  }
  // With no database relations at all, what the AI suggests is kept — and clearly marked AI-suggested.
  if (ext.relations.length === 0) {
    for (const sug of j.suggested) {
      const other = seriesId('ai', norm(sug.title).replace(/\s+/g, '-'));
      store.upsertSeries({ id: other, source: 'ai', externalId: norm(sug.title).replace(/\s+/g, '-'), title: sug.title, medium: ext.medium, year: null, runStatus: 'unknown', units: 0, unitName: ext.unitName, tags: emptyTags(), creators: [], description: '', coverUrl: null, publisher: null, artDriven: false, printStatus: 'unknown', priceRising: false, verified: false, stub: true, judged: false });
      store.upsertRelation(sug.direction === 'before' ? { before: other, after: id, importance: sug.importance, confidence: 'ai_suggested', note: sug.why } : { before: id, after: other, importance: sug.importance, confidence: 'ai_suggested', note: sug.why });
    }
  }
  return { id };
}

// ---- step 2: approved screenshots go to the AI -------------------------------------------------------

export type ProcessOutcome = 'done' | 'queued_offline' | 'needs_key' | 'failed';

/** Reuse a series the reader already has, instead of looking it up again. */
function knownSeries(c: Candidate, deps: Deps): string | null {
  for (const s of deps.store.findSeriesByTitle(c.title)) {
    if (!s.stub && norm(s.title) === norm(c.title)) return s.id;
  }
  return null;
}

export async function processQueued(shotId: string, deps: Deps): Promise<ProcessOutcome> {
  const { store } = deps;
  const shot = store.getScreenshot(shotId);
  if (!shot || shot.status !== 'queued') return 'done';
  store.updateScreenshot(shotId, { status: 'processing', error: null });
  store.deleteCaptures(shotId); // a retry starts clean, so nothing is counted twice

  const requeue = (error: string, outcome: ProcessOutcome): ProcessOutcome => { store.updateScreenshot(shotId, { status: 'queued', error }); return outcome; };
  const image = await deps.prepare(shot.uri).catch(() => null);
  if (!image) { store.updateScreenshot(shotId, { status: 'error', error: 'This screenshot couldn’t be read (was it deleted?).' }); return 'failed'; }

  const res = await extractCaptures(deps.ai, image, shot.ocrText ?? '', deps.aiOptions);
  if (!res.ok) {
    if (res.kind === 'no_key') return requeue(res.message, 'needs_key');
    if (res.kind === 'network' || res.kind === 'rate_limited' || res.kind === 'server') return requeue(res.message, 'queued_offline');
    store.updateScreenshot(shotId, { status: res.kind === 'unauthorized' ? 'queued' : 'needs_review', error: res.message });
    return res.kind === 'unauthorized' ? 'needs_key' : 'failed';
  }
  const data = res.data!;
  if (!data.comicRelated || data.candidates.length === 0) {
    store.updateScreenshot(shotId, { status: 'skipped', gateReason: 'The AI didn’t find a comic in it.', ocrText: null });
    return 'done';
  }

  let needsEye = false; const found: string[] = [];
  for (const c of data.candidates) {
    const base = { screenshotId: shotId, title: c.title, titleConf: c.titleConfidence, creators: c.creators, medium: c.medium, seriesId: null, options: null } as const;
    if (!isReadable(c)) { store.addCapture({ ...base, status: 'needs_review' }); needsEye = true; continue; }

    const already = knownSeries(c, deps);
    if (already) { store.markFound(already, shot.takenAt); store.addCapture({ ...base, status: 'matched', seriesId: already }); found.push(c.title); continue; }

    let ranked: Ranked[];
    try { ranked = rankCandidates(c, await findCandidates(c.title, c.medium, deps)); }
    catch (e) {
      if (e instanceof LookupError && (e.kind === 'network' || e.kind === 'rate_limited')) {
        // Leave it queued; it is redone from scratch next time (its half-made captures are cleared at the start).
        return requeue(e.message, 'queued_offline');
      }
      ranked = [];
    }
    const decision = decideMatch(ranked);
    if (decision.kind === 'confident') {
      const r = await enrichSeries(decision.best.series, deps, shot.takenAt);
      store.addCapture({ ...base, status: 'matched', seriesId: r.id }); found.push(decision.best.series.title);
      if (r.networkDown) return requeue(r.aiError ?? 'Offline', 'queued_offline');
    } else if (decision.kind === 'ambiguous') {
      store.addCapture({ ...base, status: 'needs_choice', options: decision.options.map((o) => ({ series: o.series, score: o.score })) }); needsEye = true;
    } else {
      // Not in any database: keep an unverified card rather than lose the find.
      const ext: ExternalSeries = { source: 'ai', externalId: norm(c.title).replace(/\s+/g, '-'), title: c.title, altTitles: [], medium: c.medium, status: 'unknown', units: 0, unitName: 'volumes', genres: [], tags: [], creators: c.creators, description: '', relations: [] };
      const id = store.upsertSeries(toInput(ext)); store.markFound(id, shot.takenAt);
      store.addCapture({ ...base, status: 'unmatched', seriesId: id }); needsEye = true;
    }
  }
  store.updateScreenshot(shotId, { status: needsEye ? 'needs_review' : 'ready', summary: found.length ? found.join(', ') : null, error: null });
  return 'done';
}

/** Send everything queued, oldest first. Stops at the first sign of no connection or no key. */
export async function drainQueue(deps: Deps): Promise<{ processed: number; stoppedBy: ProcessOutcome | null }> {
  const queued = deps.store.listScreenshots().filter((s) => s.status === 'queued').sort((a, b) => a.takenAt - b.takenAt);
  let processed = 0;
  for (const s of queued) {
    const out = await processQueued(s.id, deps);
    if (out === 'queued_offline' || out === 'needs_key') return { processed, stoppedBy: out };
    processed++;
  }
  return { processed, stoppedBy: null };
}

// ---- the reader resolves what needed their eye -------------------------------------------------------

export async function chooseOption(capture: CaptureRow, optionIndex: number, deps: Deps): Promise<EnrichResult | null> {
  const option = capture.options?.[optionIndex];
  if (!option) return null;
  const shot = deps.store.getScreenshot(capture.screenshotId);
  const r = await enrichSeries(option.series, deps, shot?.takenAt ?? deps.now());
  deps.store.updateCapture(capture.id, { status: 'matched', seriesId: r.id, options: null });
  settleScreenshot(capture.screenshotId, deps.store);
  return r;
}

export function dismissCapture(capture: CaptureRow, store: MindStore): void {
  store.updateCapture(capture.id, { status: 'dismissed' });
  settleScreenshot(capture.screenshotId, store);
}

/** A screenshot becomes Ready once none of its captures still needs the reader's eye. */
export function settleScreenshot(shotId: string, store: MindStore): void {
  const open = store.listCaptures(shotId).some((c) => c.status === 'needs_review' || c.status === 'needs_choice' || c.status === 'unmatched');
  const shot = store.getScreenshot(shotId);
  if (shot && (shot.status === 'needs_review' || shot.status === 'ready')) store.updateScreenshot(shotId, { status: open ? 'needs_review' : 'ready' });
}

/** The reader fixed a shaky read by typing the title. Search again with it; ask if it is still unclear. */
export async function reresolveCapture(capture: CaptureRow, title: string, deps: Deps): Promise<'matched' | 'needs_choice' | 'unmatched' | 'offline'> {
  const { store } = deps;
  const shot = store.getScreenshot(capture.screenshotId);
  const takenAt = shot?.takenAt ?? deps.now();
  let ranked: Ranked[];
  try { ranked = rankCandidates({ title, creators: capture.creators, medium: capture.medium }, await findCandidates(title, capture.medium, deps)); }
  catch (e) { if (e instanceof LookupError) return 'offline'; ranked = []; }
  const decision = decideMatch(ranked);
  store.updateCapture(capture.id, { title });
  let result: 'matched' | 'needs_choice' | 'unmatched';
  if (decision.kind === 'confident') {
    const r = await enrichSeries(decision.best.series, deps, takenAt);
    store.updateCapture(capture.id, { status: 'matched', seriesId: r.id, options: null }); result = 'matched';
  } else if (decision.kind === 'ambiguous') {
    store.updateCapture(capture.id, { status: 'needs_choice', options: decision.options.map((o) => ({ series: o.series, score: o.score })) }); result = 'needs_choice';
  } else {
    const ext: ExternalSeries = { source: 'ai', externalId: norm(title).replace(/\s+/g, '-'), title, altTitles: [], medium: capture.medium, status: 'unknown', units: 0, unitName: 'volumes', genres: [], tags: [], creators: capture.creators, description: '', relations: [] };
    const id = store.upsertSeries(toInput(ext)); store.markFound(id, takenAt);
    store.updateCapture(capture.id, { status: 'unmatched', seriesId: id, options: null }); result = 'unmatched';
  }
  settleScreenshot(capture.screenshotId, store);
  return result;
}

/** Keep an unverified card as it is: the reader has seen it and accepts it. */
export function keepUnverified(capture: CaptureRow, store: MindStore): void {
  store.updateCapture(capture.id, { status: 'matched' });
  settleScreenshot(capture.screenshotId, store);
}
