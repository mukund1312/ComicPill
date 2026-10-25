import { beforeEach, describe, expect, it, vi } from 'vitest';
import berserk from './remote/fixtures/anilist-berserk.json';
import { memoryStore } from './memoryStore';
import { addFind, approveScreenshots, chooseOption, drainQueue, enrichSeries, gateNewScreenshot, keepUnverified, processQueued, reresolveCapture, searchForAdd, type Deps } from './pipeline';
import type { ExternalSeries, FetchLike } from './remote/types';

vi.mock('./remote/extract', async (orig) => ({ ...(await orig<typeof import('./remote/extract')>()), extractCaptures: vi.fn() }));
vi.mock('./remote/judge', async (orig) => ({ ...(await orig<typeof import('./remote/judge')>()), judgeSeries: vi.fn() }));
import { extractCaptures } from './remote/extract';
import { judgeSeries } from './remote/judge';

const extract = vi.mocked(extractCaptures); const judge = vi.mocked(judgeSeries);

const cand = (title: string, conf: 'high' | 'medium' | 'low' | 'unknown' = 'high', medium: 'manga' | 'comic' | 'graphic_novel' | 'unknown' = 'manga') => ({ title, titleConfidence: conf, creators: [], medium, mediumConfidence: 'high' });
const reply = (...candidates: ReturnType<typeof cand>[]) => ({ ok: true as const, data: { comicRelated: candidates.length > 0, sourceKind: 'reel' as const, comics: [], candidates } });
const judged = (over: Record<string, unknown> = {}) => ({ ok: true as const, data: { genre: ['dark fantasy'], tone: ['dark'], art: ['detailed'], artDriven: true, runStatus: 'ongoing' as const, relations: [], suggested: [], ...over } });
const anilistOk: FetchLike = async () => ({ ok: true, status: 200, json: async () => berserk });

let store: ReturnType<typeof memoryStore>; let clock = 1_000_000; let fetchCalls = 0;
const mkDeps = (over: Partial<Deps> = {}): Deps => ({
  store, ai: { provider: 'anthropic', model: 'm', apiKey: 'k' }, comicVineKey: null, searchLocal: () => [], prepare: async () => 'b64', ocr: async () => 'Berserk manga volume 1 new series', now: () => clock,
  fetchImpl: async (u, i) => { fetchCalls++; return anilistOk(u, i); }, ...over,
});
const shot = (assetId = 'a1') => { store.addScreenshots([{ assetId, uri: `file:///${assetId}.png`, takenAt: clock }]); return store.listScreenshots().find((s) => s.assetId === assetId)!.id; };

beforeEach(() => { store = memoryStore(() => clock); clock = 1_000_000; fetchCalls = 0; extract.mockReset(); judge.mockReset(); });

describe('step 1: the phone looks first', () => {
  it('drops private screenshots without ever keeping their text', async () => {
    const id = shot();
    await gateNewScreenshot(id, mkDeps({ ocr: async () => 'Your OTP is 123456 for the Saga order' }), true);
    expect(store.getScreenshot(id)).toMatchObject({ status: 'sensitive', ocrText: null });
  });
  it('skips screenshots with nothing comic-related', async () => {
    const id = shot();
    await gateNewScreenshot(id, mkDeps({ ocr: async () => '12:30 Battery 80% Wi-Fi Settings Notifications Airplane mode Bluetooth' }), true);
    expect(store.getScreenshot(id)?.status).toBe('skipped');
  });
  it('holds comic-looking ones for approval — unless auto-send is on', async () => {
    const a = shot('a'); const b = shot('b');
    await gateNewScreenshot(a, mkDeps(), false); await gateNewScreenshot(b, mkDeps(), true);
    expect(store.getScreenshot(a)?.status).toBe('awaiting_approval');
    expect(store.getScreenshot(b)?.status).toBe('queued');
  });
  it('never auto-sends when the phone could not read the text', async () => {
    const id = shot();
    await gateNewScreenshot(id, mkDeps({ ocr: async () => null }), true);
    expect(store.getScreenshot(id)?.status).toBe('awaiting_approval');
  });
  it('only approved screenshots move on', () => {
    const a = shot('a'); const b = shot('b');
    store.updateScreenshot(a, { status: 'awaiting_approval' });
    approveScreenshots([a, b], store);
    expect([store.getScreenshot(a)?.status, store.getScreenshot(b)?.status]).toEqual(['queued', 'new']);
  });
});

describe('step 2: approved screenshots become series', () => {
  const queued = (assetId = 'a1') => { const id = shot(assetId); store.updateScreenshot(id, { status: 'queued', ocrText: 'Berserk' }); return id; };

  it('a clear title becomes a verified series, tagged once by the AI', async () => {
    extract.mockResolvedValue(reply(cand('Berserk'))); judge.mockResolvedValue(judged());
    const id = queued();
    expect(await processQueued(id, mkDeps())).toBe('done');
    const d = store.dump();
    expect(d.shots[0]).toMatchObject({ status: 'ready', summary: 'Berserk' });
    expect(d.series.find((s) => s.id === 'anilist:30002')).toMatchObject({ verified: true, judged: true, artDriven: true, runStatus: 'ongoing', title: 'Berserk' });
    expect(d.series[0].tags.tone).toEqual(['dark']);
    expect(d.captures[0]).toMatchObject({ status: 'matched', seriesId: 'anilist:30002' });
  });

  it('the same comic in a second screenshot costs no new lookup and no new AI tagging', async () => {
    extract.mockResolvedValue(reply(cand('Berserk'))); judge.mockResolvedValue(judged());
    await processQueued(queued('a1'), mkDeps());
    const calls = { fetch: fetchCalls, judge: judge.mock.calls.length };
    await processQueued(queued('a2'), mkDeps());
    expect(fetchCalls).toBe(calls.fetch); expect(judge.mock.calls.length).toBe(calls.judge);
    expect(store.dump().captures.filter((c) => c.status === 'matched')).toHaveLength(2);
  });

  it('API responses are cached across different screenshots of different titles', async () => {
    extract.mockResolvedValue(reply(cand('Berserk Vol 1', 'high'))); judge.mockResolvedValue(judged());
    await processQueued(queued('a1'), mkDeps());
    const n = fetchCalls;
    extract.mockResolvedValue(reply(cand('Berserk Vol 1', 'high'))); // same query text again, series not yet "known" by title
    store.dump().series.forEach(() => undefined);
    await processQueued(queued('a2'), mkDeps());
    expect(fetchCalls).toBe(n);
  });

  it('low confidence goes to Needs your eye, with no lookup', async () => {
    extract.mockResolvedValue(reply(cand('Maybe Berserk', 'low')));
    const id = queued();
    await processQueued(id, mkDeps());
    expect(store.getScreenshot(id)?.status).toBe('needs_review');
    expect(store.dump().captures[0].status).toBe('needs_review');
    expect(fetchCalls).toBe(0);
  });

  it('a title in no database becomes an unverified card instead of being lost', async () => {
    extract.mockResolvedValue(reply(cand('Zzyzx Indie Zine Number Nine', 'high', 'comic')));
    const id = queued();
    await processQueued(id, mkDeps({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: { Page: { media: [] } } }) }) }));
    const s = store.dump().series[0];
    expect(s).toMatchObject({ source: 'ai', verified: false });
    expect(store.getScreenshot(id)?.status).toBe('needs_review');
    expect(store.dump().captures[0].status).toBe('unmatched');
  });

  it('two close candidates ask the reader, and choosing finishes the job', async () => {
    const a = { source: 'comicvine', externalId: '1', title: 'Paper Girls', altTitles: [], medium: 'comic', status: 'unknown', units: 30, unitName: 'issues', genres: [], tags: [], creators: [], description: '', relations: [] } as ExternalSeries;
    const b = { ...a, externalId: '2', year: 2022 } as ExternalSeries;
    extract.mockResolvedValue(reply(cand('Paper Girls', 'high', 'comic'))); judge.mockResolvedValue(judged({ runStatus: 'finished' }));
    const id = queued();
    const deps = mkDeps({ searchLocal: () => [a, b] });
    await processQueued(id, deps);
    expect(store.getScreenshot(id)?.status).toBe('needs_review');
    const capture = store.dump().captures[0];
    expect(capture.status).toBe('needs_choice');
    expect(capture.options).toHaveLength(2);
    await chooseOption(capture, 1, deps);
    expect(store.getCapture(capture.id)).toMatchObject({ status: 'matched', seriesId: 'comicvine:2' });
    expect(store.getScreenshot(id)?.status).toBe('ready');
  });

  it('the AI saying it is not a comic skips the screenshot', async () => {
    extract.mockResolvedValue(reply());
    const id = queued();
    await processQueued(id, mkDeps());
    expect(store.getScreenshot(id)).toMatchObject({ status: 'skipped', ocrText: null });
  });
});

describe('offline, limits and keys', () => {
  const queued = () => { const id = shot(); store.updateScreenshot(id, { status: 'queued', ocrText: 'x' }); return id; };

  it('no connection to the AI: stays queued and is sent when the phone is back online', async () => {
    const id = queued();
    extract.mockResolvedValueOnce({ ok: false, kind: 'network', message: 'Couldn’t reach the provider.' });
    expect(await processQueued(id, mkDeps())).toBe('queued_offline');
    expect(store.getScreenshot(id)).toMatchObject({ status: 'queued', error: 'Couldn’t reach the provider.' });
    extract.mockResolvedValue(reply(cand('Berserk'))); judge.mockResolvedValue(judged());
    expect(await drainQueue(mkDeps())).toEqual({ processed: 1, stoppedBy: null });
    expect(store.getScreenshot(id)?.status).toBe('ready');
  });

  it('no connection to the comic database: queued again, and nothing is counted twice', async () => {
    const id = queued();
    extract.mockResolvedValue(reply(cand('Berserk'))); judge.mockResolvedValue(judged());
    expect(await processQueued(id, mkDeps({ fetchImpl: async () => { throw new Error('offline'); } }))).toBe('queued_offline');
    expect(store.getScreenshot(id)?.status).toBe('queued');
    await processQueued(id, mkDeps());
    expect(store.dump().captures).toHaveLength(1);
  });

  it('a rate limit stops the queue instead of hammering the provider', async () => {
    extract.mockResolvedValue({ ok: false, kind: 'rate_limited', message: 'Slow down.' });
    shot('a'); shot('b'); store.listScreenshots().forEach((s) => store.updateScreenshot(s.id, { status: 'queued' }));
    const out = await drainQueue(mkDeps());
    expect(out).toEqual({ processed: 0, stoppedBy: 'queued_offline' });
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it('no key: stays queued and says so', async () => {
    extract.mockResolvedValue({ ok: false, kind: 'no_key', message: 'Add an API key in Settings first.' });
    const id = queued();
    expect(await processQueued(id, mkDeps({ ai: null }))).toBe('needs_key');
    expect(store.getScreenshot(id)).toMatchObject({ status: 'queued', error: 'Add an API key in Settings first.' });
  });

  it('a screenshot that was deleted is an error, not a crash', async () => {
    const id = queued();
    expect(await processQueued(id, mkDeps({ prepare: async () => null }))).toBe('failed');
    expect(store.getScreenshot(id)?.status).toBe('error');
  });
});

describe('relations', () => {
  const series = (over: Partial<ExternalSeries> = {}): ExternalSeries => ({ source: 'comicvine', externalId: '9', title: 'Paper Girls', altTitles: [], medium: 'comic', status: 'finished', units: 30, unitName: 'issues', genres: ['sci-fi'], tags: [], creators: ['Brian K. Vaughan'], description: 'd', relations: [], ...over });

  it('database relations are Verified and the AI may only re-weigh them', async () => {
    judge.mockResolvedValue(judged({ relations: [{ externalId: 'p', importance: 'helpful', why: 'Context, not essential' }, { externalId: 'not-listed', importance: 'required', why: 'invented' }] }));
    await enrichSeries(series({ relations: [{ kind: 'prequel', externalId: 'p', title: 'Prologue', units: 2, status: 'finished' }] }), mkDeps(), clock);
    const rels = store.dump().relations;
    expect(rels).toHaveLength(1);
    expect(rels[0]).toMatchObject({ before: 'comicvine:p', after: 'comicvine:9', importance: 'helpful', confidence: 'verified', note: 'Context, not essential' });
  });

  it('with no database relations, AI suggestions are kept but marked AI-suggested', async () => {
    judge.mockResolvedValue(judged({ suggested: [{ title: 'Paper Girls: Origins', direction: 'before', importance: 'helpful', why: 'Sets up the world' }] }));
    await enrichSeries(series(), mkDeps(), clock);
    const rel = store.dump().relations[0];
    expect(rel).toMatchObject({ importance: 'helpful', confidence: 'ai_suggested', after: 'comicvine:9' });
    expect(store.getSeries(rel.before)).toMatchObject({ source: 'ai', verified: false, stub: true });
  });

  it('local catalog relations are Verified and cost no AI call', async () => {
    const local = series({ source: 'local', externalId: 'w2', relations: [{ kind: 'prequel', externalId: 'w1', title: 'Vol 1', units: 1, status: 'unknown', importance: 'required', confidence: 'verified', direction: 'before' }] });
    await enrichSeries(local, mkDeps(), clock);
    expect(judge).not.toHaveBeenCalled();
    expect(store.dump().relations[0]).toMatchObject({ before: 'local:w1', after: 'local:w2', importance: 'required', confidence: 'verified' });
    expect(store.getSeries('local:w2')?.judged).toBe(true);
  });

  it('"looks wrong" survives re-enrichment', async () => {
    judge.mockResolvedValue(judged({ suggested: [{ title: 'Bogus Prequel', direction: 'before', importance: 'required', why: 'x' }] }));
    await enrichSeries(series(), mkDeps(), clock);
    const rel = store.dump().relations[0];
    store.flagWrong(rel.before, rel.after);
    store.upsertRelation({ before: rel.before, after: rel.after, importance: 'required', confidence: 'ai_suggested' }); // a later refresh says the same thing again
    expect(store.dump().relations[0].wrong).toBe(true);
  });

  it('an AI outage while tagging leaves the series usable and not marked judged', async () => {
    judge.mockResolvedValue({ ok: false, kind: 'network', message: 'offline' });
    const r = await enrichSeries(series(), mkDeps(), clock);
    expect(r.networkDown).toBe(true);
    expect(store.getSeries('comicvine:9')).toMatchObject({ judged: false, title: 'Paper Girls' });
  });
});

describe('resolving what needed the reader’s eye', () => {
  const lowConfidence = async () => {
    extract.mockResolvedValue(reply(cand('Berzerk', 'low')));
    const id = shot(); store.updateScreenshot(id, { status: 'queued', ocrText: 'x' });
    await processQueued(id, mkDeps());
    return { id, capture: store.dump().captures[0] };
  };

  it('a corrected title is searched again and becomes a verified series', async () => {
    const { id, capture } = await lowConfidence();
    judge.mockResolvedValue(judged());
    expect(await reresolveCapture(capture, 'Berserk', mkDeps())).toBe('matched');
    expect(store.getCapture(capture.id)).toMatchObject({ status: 'matched', seriesId: 'anilist:30002', title: 'Berserk' });
    expect(store.getScreenshot(id)?.status).toBe('ready');
  });

  it('offline during the re-search changes nothing', async () => {
    const { capture } = await lowConfidence();
    expect(await reresolveCapture(capture, 'Berserk', mkDeps({ fetchImpl: async () => { throw new Error('offline'); } }))).toBe('offline');
    expect(store.getCapture(capture.id)?.status).toBe('needs_review');
  });

  it('keeping an unverified card clears the screenshot’s Needs your eye', async () => {
    extract.mockResolvedValue(reply(cand('Zzyzx Indie Zine Number Nine', 'high', 'comic')));
    const id = shot(); store.updateScreenshot(id, { status: 'queued' });
    await processQueued(id, mkDeps({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: { Page: { media: [] } } }) }) }));
    expect(store.getScreenshot(id)?.status).toBe('needs_review');
    keepUnverified(store.dump().captures[0], store);
    expect(store.getScreenshot(id)?.status).toBe('ready');
  });
});

describe('the monthly cap on AI calls', () => {
  const capped = (allowed: boolean[]) => { let i = 0; let spent = 0; return { budget: { allow: () => allowed[Math.min(i++, allowed.length - 1)], spend: () => { spent++; } }, spent: () => spent }; };

  it('stops before reading a screenshot once the cap is reached, and keeps it queued', async () => {
    const id = shot(); store.updateScreenshot(id, { status: 'queued', ocrText: 'x' });
    const c = capped([false]);
    expect(await processQueued(id, mkDeps({ aiBudget: c.budget }))).toBe('limit_reached');
    expect(extract).not.toHaveBeenCalled();
    expect(store.getScreenshot(id)).toMatchObject({ status: 'queued' });
    expect(store.getScreenshot(id)?.error).toContain('limit');
    expect(c.spent()).toBe(0);
  });

  it('counts each call it makes', async () => {
    extract.mockResolvedValue(reply(cand('Berserk'))); judge.mockResolvedValue(judged());
    const id = shot(); store.updateScreenshot(id, { status: 'queued', ocrText: 'x' });
    const c = capped([true]);
    await processQueued(id, mkDeps({ aiBudget: c.budget }));
    expect(c.spent()).toBe(2); // one screenshot read + one series tagging
  });

  it('a series is still saved, untagged, when the cap lands between reading and tagging', async () => {
    extract.mockResolvedValue(reply(cand('Berserk')));
    const id = shot(); store.updateScreenshot(id, { status: 'queued', ocrText: 'x' });
    await processQueued(id, mkDeps({ aiBudget: capped([true, false]).budget }));
    expect(judge).not.toHaveBeenCalled();
    expect(store.getSeries('anilist:30002')).toMatchObject({ judged: false, title: 'Berserk' });
  });

  it('draining stops at the cap instead of trying every screenshot', async () => {
    shot('a'); shot('b'); store.listScreenshots().forEach((s) => store.updateScreenshot(s.id, { status: 'queued' }));
    expect(await drainQueue(mkDeps({ aiBudget: capped([false]).budget }))).toEqual({ processed: 0, stoppedBy: 'limit_reached' });
  });
});

describe('add by title', () => {
  it('searches and lists the best matches, then adds the chosen one as a find', async () => {
    judge.mockResolvedValue(judged());
    const deps = mkDeps();
    const options = await searchForAdd('Berserk', deps);
    expect(options[0].series.title).toBe('Berserk');
    expect(options.every((o) => o.score >= 0.4)).toBe(true);
    const r = await addFind(options[0].series, deps);
    expect(store.getSeries(r.id)).toMatchObject({ title: 'Berserk', readStatus: 'planned', foundAt: clock });
  });
  it('an empty search returns nothing and costs nothing', async () => {
    expect(await searchForAdd('   ', mkDeps())).toEqual([]);
    expect(fetchCalls).toBe(0);
  });
  it('works with no AI key: the series is saved with the database’s own genres', async () => {
    judge.mockResolvedValue({ ok: false, kind: 'no_key', message: 'Add an API key in Settings first.' });
    const deps = mkDeps({ ai: null });
    const [first] = await searchForAdd('Berserk', deps);
    const r = await addFind(first.series, deps);
    expect(store.getSeries(r.id)?.tags.genre).toContain('action');
    expect(store.getSeries(r.id)?.judged).toBe(false);
  });
});
