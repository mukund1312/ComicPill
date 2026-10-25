import { describe, expect, it } from 'vitest';
import berserk from './fixtures/anilist-berserk.json';
import { parseSearch, searchAniList } from './anilist';
import { parseVolumes, searchComicVine } from './comicvine';
import { decideMatch, rankCandidates } from './matcher';
import { parseCapture, isReadable } from './extract';
import { parseJudgement } from './judge';
import { defaultImportance, LookupError, orderOf, type ExternalSeries, type FetchLike } from './types';
import { gateScreenshot } from '../capture/ocrFilter';

const res = (status: number, body: unknown): FetchLike => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('AniList', () => {
  const found = parseSearch(berserk);
  it('turns a real response into series, dropping anime adaptations from relations', () => {
    expect(found).toHaveLength(3);
    const b = found[0];
    expect(b).toMatchObject({ source: 'anilist', title: 'Berserk', medium: 'manga', status: 'ongoing', unitName: 'volumes' });
    expect(b.creators).toContain('Kentarou Miura');
    expect(b.relations.every((r) => r.title && !/Kenpuu|Ougon Jidai-hen I /.test(r.title))).toBe(true);
    expect(b.relations.length).toBeGreaterThan(0);
    expect(b.relations.every((r) => r.kind === 'other')).toBe(true); // alternative / character / other: none imply a reading order
  });
  it('maps statuses', () => expect(found[2].status).toBe('finished'));
  it('reports rate limits and outages as typed errors', async () => {
    await expect(searchAniList('x', res(429, {}))).rejects.toMatchObject({ kind: 'rate_limited' });
    await expect(searchAniList('x', res(500, {}))).rejects.toMatchObject({ kind: 'server' });
    await expect(searchAniList('x', (async () => { throw new Error('offline'); }) as FetchLike)).rejects.toBeInstanceOf(LookupError);
  });
  it('searches with the title as a variable (never string-built into the query)', async () => {
    let body = '';
    await searchAniList('Fire "Force"', async (_u, init) => { body = String(init?.body); return { ok: true, status: 200, json: async () => berserk }; });
    expect(JSON.parse(body).variables).toEqual({ search: 'Fire "Force"' });
  });
});

describe('Comic Vine', () => {
  const body = { status_code: 1, results: [{ id: 18166, name: 'Saga', start_year: '2012', count_of_issues: 66, deck: 'x', description: '<p>An epic &amp; sweeping <b>space opera</b></p>', publisher: { name: 'Image' }, image: { medium_url: 'https://img/saga.jpg' } }] };
  it('parses volumes', () => {
    expect(parseVolumes(body)[0]).toMatchObject({ source: 'comicvine', externalId: '18166', title: 'Saga', year: 2012, units: 66, unitName: 'issues', publisher: 'Image', description: 'An epic & sweeping space opera' });
  });
  it('needs a key, and says so', async () => {
    await expect(searchComicVine('Saga', null, res(200, body))).rejects.toMatchObject({ kind: 'no_key' });
  });
  it('sends a user agent and the key, and maps failures', async () => {
    let seen = { url: '', ua: '' };
    const out = await searchComicVine('Saga', 'KEY', async (u, init) => { seen = { url: u, ua: init?.headers?.['user-agent'] ?? '' }; return { ok: true, status: 200, json: async () => body }; });
    expect(out).toHaveLength(1);
    expect(seen.url).toContain('api_key=KEY'); expect(seen.ua).toContain('ComicPill');
    await expect(searchComicVine('x', 'K', res(401, {}))).rejects.toMatchObject({ kind: 'unauthorized' });
    await expect(searchComicVine('x', 'K', res(420, {}))).rejects.toMatchObject({ kind: 'rate_limited' });
  });
  it('an error status_code means no results, not a crash', () => expect(parseVolumes({ status_code: 100, results: [] })).toEqual([]));
});

describe('relations', () => {
  it('only prequel/sequel are Required by default', () => {
    expect([defaultImportance('sequel'), defaultImportance('prequel'), defaultImportance('spin_off'), defaultImportance('side_story'), defaultImportance('other')]).toEqual(['required', 'required', 'helpful', 'helpful', 'optional']);
  });
  it('turns "target is a sequel/prequel of me" into read-order edges', () => {
    const rel = (kind: Parameters<typeof orderOf>[1]['kind']) => ({ kind, externalId: 'T', title: 't', units: 1, status: 'unknown' as const });
    expect(orderOf('ME', rel('sequel'))).toEqual({ before: 'ME', after: 'T' });
    expect(orderOf('ME', rel('prequel'))).toEqual({ before: 'T', after: 'ME' });
    expect(orderOf('ME', rel('parent'))).toEqual({ before: 'T', after: 'ME' });
    expect(orderOf('ME', rel('spin_off'))).toEqual({ before: 'ME', after: 'T' });
    expect(orderOf('ME', rel('other'))).toBeNull();
  });
});

describe('matching', () => {
  const S = (title: string, extra: Partial<ExternalSeries> = {}): ExternalSeries => ({ source: 'comicvine', externalId: title, title, altTitles: [], medium: 'comic', status: 'unknown', units: 6, unitName: 'issues', genres: [], tags: [], creators: [], description: '', relations: [], ...extra });
  it('trusts a clear winner', () => {
    const d = decideMatch(rankCandidates({ title: 'Saga', creators: [], medium: 'comic' }, [S('Saga'), S('Sagas of Something Else')]));
    expect(d.kind).toBe('confident');
  });
  it('asks when two candidates are close', () => {
    const d = decideMatch(rankCandidates({ title: 'Paper Girls', creators: [], medium: 'comic' }, [S('Paper Girls'), S('Paper Girls', { externalId: 'second', year: 2020 })]));
    expect(d.kind).toBe('ambiguous');
    if (d.kind === 'ambiguous') expect(d.options.length).toBeGreaterThanOrEqual(2);
  });
  it('gives up rather than force a bad match', () => {
    expect(decideMatch(rankCandidates({ title: 'Totally Unknown Indie Zine', creators: [], medium: 'comic' }, [S('Batman'), S('Saga')])).kind).toBe('none');
    expect(decideMatch([]).kind).toBe('none');
  });
  it('a creator in common breaks a tie, and a medium clash counts against', () => {
    const ranked = rankCandidates({ title: 'Berserk', creators: ['Kentarou Miura'], medium: 'manga' }, [S('Berserk', { creators: ['Someone Else'], medium: 'comic', externalId: 'a' }), S('Berserk', { creators: ['Kentarou Miura'], medium: 'manga', externalId: 'b' })]);
    expect(ranked[0].series.externalId).toBe('b');
  });
});

describe('the privacy gate', () => {
  it('never lets private screenshots through', () => {
    expect(gateScreenshot('Your OTP is 482913. Do not share it. Also read Saga vol. 1').gate).toBe('sensitive');
    expect(gateScreenshot('A/c XX1234 debited Rs 450 on 12-Oct. Avl bal 2300').gate).toBe('sensitive');
    expect(gateScreenshot('call me on 9876543210 about the comics').gate).toBe('sensitive');
    expect(gateScreenshot('mail me at a.b@example.com — new manga arc').gate).toBe('sensitive');
  });
  it('offers comic-looking screenshots', () => {
    expect(gateScreenshot('Just finished Saga vol. 3 — best comic series ever, Image Comics').gate).toBe('likely');
    expect(gateScreenshot('SAGA').gate).toBe('maybe'); // a cover reads as one or two big words
    expect(gateScreenshot('Berserk volume 1 new edition').gate).toBe('maybe'); // one signal: offered for review, not assumed
  });
  it('drops screenshots with nothing comic-related', () => {
    expect(gateScreenshot('').gate).toBe('skip');
    expect(gateScreenshot('12:30 Battery 80% Wi-Fi Settings Notifications Do Not Disturb Airplane mode Bluetooth 5GHz').gate).toBe('skip');
  });
});

describe('AI output is untrusted', () => {
  const field = (value: string | null, confidence: string) => ({ value, confidence });
  it('keeps readable candidates and drops "unknown" placeholders', () => {
    const out = parseCapture({ comicRelated: true, sourceKind: 'reel', comics: [
      { title: field('  Paper   Girls ', 'high'), creators: [field('Brian K. Vaughan', 'medium'), field(null, 'unknown')], medium: { value: 'comic', confidence: 'high' } },
      { title: field('unknown', 'unknown'), creators: [], medium: { value: 'unknown', confidence: 'unknown' } },
      { title: field(null, 'unknown'), creators: [], medium: { value: 'unknown', confidence: 'unknown' } },
    ] });
    expect(out?.candidates).toEqual([{ title: 'Paper Girls', titleConfidence: 'high', creators: ['Brian K. Vaughan'], medium: 'comic', mediumConfidence: 'high' }]);
    expect(isReadable(out!.candidates[0])).toBe(true);
  });
  it('low confidence is not readable (it goes to Needs your eye)', () => {
    const out = parseCapture({ comicRelated: true, sourceKind: 'cover', comics: [{ title: field('Maybe Saga', 'low'), creators: [], medium: { value: 'unknown', confidence: 'low' } }] });
    expect(isReadable(out!.candidates[0])).toBe(false);
  });
  it('rejects the wrong shape entirely', () => {
    expect(parseCapture({ nope: true })).toBeNull();
    expect(parseCapture('text')).toBeNull();
    expect(parseJudgement({ genre: 'x' })).toBeNull();
  });
  it('judgement is tidied and bounded', () => {
    const j = parseJudgement({ genre: ['Sci-Fi ', 'sci-fi', 'x'.repeat(80)], tone: ['Dark'], art: [], artDriven: true, runStatus: 'finished', relations: [{ externalId: '1', importance: 'required', why: 'y'.repeat(500) }], suggested: [{ title: '  ', direction: 'before', importance: 'helpful', why: '' }] });
    expect(j?.genre).toEqual(['sci-fi']);
    expect(j?.relations[0].why.length).toBe(200);
    expect(j?.suggested).toEqual([]);
  });
});
