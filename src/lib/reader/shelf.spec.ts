import { describe, expect, it } from 'vitest';
import { parseComicInfo, displayTitle } from './formats/comicInfo';
import { isFinished, isReadingNow, isSortKey, matchesQuery, readingNow, sortComics, sortFolders, type ShelfComic } from './shelf';

const c = (o: Partial<ShelfComic>): ShelfComic => ({ id: 'x', title: 'T', series: null, writer: null, pageCount: 10, progressPage: 0, lastReadAt: null, addedAt: 0, ...o });

describe('parseComicInfo', () => {
  it('reads the fields the library uses, decoding entities', () => {
    const info = parseComicInfo('<?xml version="1.0"?><ComicInfo><Title>Fire &amp; Ice</Title><Series>Saga</Series><Number>3</Number><Writer>Brian K. Vaughan</Writer><Year>2012</Year><Manga>YesAndRightToLeft</Manga></ComicInfo>');
    expect(info).toEqual({ title: 'Fire & Ice', series: 'Saga', number: '3', writer: 'Brian K. Vaughan', year: 2012, rtl: true });
  });
  it('leaves missing fields undefined', () => {
    expect(parseComicInfo('<ComicInfo><Series>X</Series></ComicInfo>')).toEqual({ title: undefined, series: 'X', number: undefined, writer: undefined, year: undefined, rtl: undefined });
  });
  it('builds a display title', () => {
    expect(displayTitle({ series: 'Saga', number: '3', title: 'Ice' }, 'file')).toBe('Saga #3 — Ice');
    expect(displayTitle({}, 'file')).toBe('file');
  });
});

describe('shelf', () => {
  it('classifies reading state', () => {
    expect(isReadingNow(c({ lastReadAt: 5, progressPage: 3 }))).toBe(true);
    expect(isReadingNow(c({ lastReadAt: 5, progressPage: 0 }))).toBe(false);
    expect(isFinished(c({ lastReadAt: 5, progressPage: 9 }))).toBe(true);
    expect(isReadingNow(c({ lastReadAt: 5, progressPage: 9 }))).toBe(false);
  });
  it('searches title, series and writer', () => {
    expect(matchesQuery(c({ title: 'Vol 1', series: 'Saga' }), 'saga')).toBe(true);
    expect(matchesQuery(c({ writer: 'Alan Moore' }), 'moore')).toBe(true);
    expect(matchesQuery(c({ title: 'Vol 1' }), 'xyz')).toBe(false);
  });
  it('sorts by title naturally, recency and date added', () => {
    const list = [c({ id: 'a', title: 'Issue 10', addedAt: 1, lastReadAt: 30 }), c({ id: 'b', title: 'Issue 2', addedAt: 3 }), c({ id: 'c', title: 'Issue 1', addedAt: 2, lastReadAt: 40 })];
    expect(sortComics(list, 'title').map((x) => x.id)).toEqual(['c', 'b', 'a']);
    expect(sortComics(list, 'added').map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(sortComics(list, 'recent').map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
  it('sorts both ways, with numbers before letters', () => {
    const list = [c({ id: 'a', title: 'Hulk', addedAt: 1 }), c({ id: 'b', title: '10 Avengers', addedAt: 3 }), c({ id: 'c', title: '2 Avengers', addedAt: 2 }), c({ id: 'd', title: 'Alpha', addedAt: 4 })];
    expect(sortComics(list, 'title').map((x) => x.id)).toEqual(['c', 'b', 'd', 'a']);
    expect(sortComics(list, 'titleDesc').map((x) => x.id)).toEqual(['a', 'd', 'b', 'c']);
    expect(sortComics(list, 'oldest').map((x) => x.id)).toEqual(['a', 'c', 'b', 'd']);
  });
  it('orders folders by name or by when they were made', () => {
    const folders = [{ name: 'Marvel', createdAt: 2 }, { name: '90s', createdAt: 3 }, { name: 'DC', createdAt: 1 }];
    expect(sortFolders(folders, 'title').map((f) => f.name)).toEqual(['90s', 'DC', 'Marvel']);
    expect(sortFolders(folders, 'titleDesc').map((f) => f.name)).toEqual(['Marvel', 'DC', '90s']);
    expect(sortFolders(folders, 'added').map((f) => f.name)).toEqual(['90s', 'Marvel', 'DC']);
    expect(sortFolders(folders, 'oldest').map((f) => f.name)).toEqual(['DC', 'Marvel', '90s']);
  });
  it('recognises saved sort choices', () => {
    expect(isSortKey('oldest')).toBe(true);
    expect(isSortKey('banana')).toBe(false);
  });
  it('lists Reading Now most-recent first', () => {
    const list = [c({ id: 'a', lastReadAt: 10, progressPage: 2 }), c({ id: 'b', lastReadAt: 20, progressPage: 4 }), c({ id: 'z', lastReadAt: 30, progressPage: 0 })];
    expect(readingNow(list).map((x) => x.id)).toEqual(['b', 'a']);
  });
});
