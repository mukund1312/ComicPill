import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromComicVine, isAllowedCoverUrl, normalizeAuthor, parseOpenLibrary, pickIsbn13, rankResults, searchOnline, toManualComic, type OnlineResult } from './online';
import { validateManual } from './manual';
import type { FetchLike } from '../mind/remote/types';

const real = JSON.parse(readFileSync(new URL('./__fixtures__/openlibrary-knightfall.json', import.meta.url), 'utf8'));
const ok = (body: unknown): ReturnType<FetchLike> => Promise.resolve({ ok: true, status: 200, json: async () => body });

describe('normalizeAuthor / pickIsbn13', () => {
  it('puts a catalogue-style name in reading order', () => {
    expect(normalizeAuthor('Moench, Doug.')).toBe('Doug Moench');
    expect(normalizeAuthor('Chuck Dixon')).toBe('Chuck Dixon');
    expect(normalizeAuthor("O'Neil, Dennis")).toBe("Dennis O'Neil");
  });
  it('picks a valid ISBN-13 from a mixed list, converting an ISBN-10 if that is all there is', () => {
    expect(pickIsbn13(['1401285872', '1563891425', '9781401285876'])).toBe('9781401285876');
    expect(pickIsbn13(['1563891484'])).toBe('9781563891489');
    expect(pickIsbn13(['12345', 'nope'])).toBeNull();
    expect(pickIsbn13(undefined)).toBeNull();
  });
});

describe('parseOpenLibrary on a real response', () => {
  const results = parseOpenLibrary(real);
  it('reads every record with its credits, publisher, year, ISBN and cover', () => {
    expect(results.length).toBe(real.docs.length);
    const k = results.find((r) => r.title.toLowerCase() === 'batman: knightfall');
    expect(k).toMatchObject({ source: 'openlibrary', year: 1993, publisher: 'DC Comics', isbn13: '9781563891489' });
    expect(k?.authors).toEqual(['Doug Moench', 'Chuck Dixon', 'Alan Grant']);
    expect(k?.coverUrl).toBe('https://covers.openlibrary.org/b/id/9270263-L.jpg?default=false');
  });
  it('only ever offers a cover from an allowed host', () => {
    for (const r of results) expect(r.coverUrl === null || isAllowedCoverUrl(r.coverUrl)).toBe(true);
    expect(isAllowedCoverUrl('http://covers.openlibrary.org/b/id/1-L.jpg')).toBe(false); // not https
    expect(isAllowedCoverUrl('https://evil.example.com/cover.jpg')).toBe(false);
    expect(isAllowedCoverUrl(null)).toBe(false);
  });
  it('shrugs off garbage', () => {
    expect(parseOpenLibrary(null)).toEqual([]);
    expect(parseOpenLibrary({ docs: [{ title: '' }, { nope: 1 }, null] })).toEqual([]);
  });
});

describe('rankResults', () => {
  const r = (over: Partial<OnlineResult>): OnlineResult => ({ source: 'openlibrary', id: 'x', title: 'T', authors: [], publisher: null, year: null, isbn13: null, pages: null, coverUrl: null, ...over });
  it('puts results that match the search first and drops repeats of the same ISBN', () => {
    const out = rankResults([r({ id: 'a', title: 'Something else' }), r({ id: 'b', title: 'Batman: Knightfall', isbn13: '9781563891489' }), r({ id: 'c', title: 'Batman Knightfall', isbn13: '9781563891489' })], 'batman knightfall');
    expect(out.map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('prefers a result with a cover when the match is otherwise equal', () => {
    expect(rankResults([r({ id: 'no', title: 'Hush' }), r({ id: 'yes', title: 'Hush', coverUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg' })], 'hush')[0].id).toBe('yes');
  });
});

describe('toManualComic', () => {
  it('makes an entry the reader’s own library accepts, with the service’s details but no shared catalog', () => {
    const comic = toManualComic(parseOpenLibrary(real).find((x) => x.isbn13 === '9781563891489')!);
    expect(comic).toMatchObject({ title: 'Batman: knightfall', publisher: 'DC Comics', isbn13: '9781563891489', year: 1993, format: 'physical' });
    expect(validateManual({ title: comic.title, publisher: comic.publisher ?? '', isbn: comic.isbn13 ?? '', year: String(comic.year) }).ok).toBe(true);
  });
});

describe('searchOnline', () => {
  it('sends only the search text and returns ranked results', async () => {
    let seen = '';
    const fetchImpl: FetchLike = (url) => { seen = url; return ok(real); };
    const out = await searchOnline('  batman   knightfall ', { fetchImpl });
    expect(seen).toContain('q=batman%20knightfall');
    expect(seen).not.toMatch(/api_key|comicpill/i);
    expect(out.reached).toBe(true);
    expect(out.results[0].title.toLowerCase()).toContain('knightfall');
  });
  it('says so, in plain words, when nothing can be reached', async () => {
    const out = await searchOnline('hush', { fetchImpl: () => Promise.reject(new Error('Network request failed')) });
    expect(out.reached).toBe(false);
    expect(out.results).toEqual([]);
    expect(out.notes[0]).toMatch(/Couldn’t reach Open Library/);
  });
  it('still shows what one source found when the other fails', async () => {
    const fetchImpl: FetchLike = (url) => (url.includes('openlibrary') ? ok(real) : Promise.reject(new Error('offline')));
    const out = await searchOnline('batman', { comicVineKey: 'k', fetchImpl });
    expect(out.results.length).toBeGreaterThan(0);
    expect(out.notes.join(' ')).toMatch(/Comic Vine/);
    expect(out.reached).toBe(true);
  });
  it('does not search for nothing', async () => {
    let called = false;
    await searchOnline(' ', { fetchImpl: () => { called = true; return ok({}); } });
    expect(called).toBe(false);
  });
  it('turns Comic Vine volumes into the same shape, keeping only covers from allowed hosts', () => {
    const out = fromComicVine([{ source: 'comicvine', externalId: '1', title: 'Hush', altTitles: [], medium: 'comic', year: 2002, status: 'unknown', units: 12, unitName: 'issues', genres: [], tags: [], creators: ['Jeph Loeb'], description: '', coverUrl: 'https://comicvine.gamespot.com/a/uploads/x.jpg', publisher: 'DC', relations: [] }]);
    expect(out[0]).toMatchObject({ source: 'comicvine', title: 'Hush', year: 2002, publisher: 'DC' });
    expect(out[0].coverUrl).toBe('https://comicvine.gamespot.com/a/uploads/x.jpg');
  });
});
