import { describe, expect, it } from 'vitest';
import { addItems, draftStats, libraryReadySummary, patchItems, readableIds, removeItems, toLibraryFields, type DraftItem } from './collectionDraft';

const item = (workId: string, over: Partial<DraftItem> = {}): DraftItem => ({ workId, title: workId, ownership: 'physical', reading: 'unread', source: 'manual', ...over });

describe('collection draft', () => {
  it('adds new books and keeps what the reader already chose for a repeat', () => {
    const a = [item('a', { ownership: 'digital', reading: 'finished' })];
    const out = addItems(a, [item('a'), item('b'), item('b')]);
    expect(out.map((x) => x.workId)).toEqual(['a', 'b']);
    expect(out[0]).toMatchObject({ ownership: 'digital', reading: 'finished' });
  });
  it('edits ownership and reading state independently, one or in bulk', () => {
    const d = [item('a'), item('b'), item('c')];
    const own = patchItems(d, new Set(['a', 'b']), { ownership: 'wishlist' });
    expect(own.map((x) => x.ownership)).toEqual(['wishlist', 'wishlist', 'physical']);
    expect(own.every((x) => x.reading === 'unread')).toBe(true);
    const read = patchItems(own, new Set(['c']), { reading: 'finished' });
    expect(read[2]).toMatchObject({ ownership: 'physical', reading: 'finished' });
    expect(patchItems(d, new Set(['zzz']), { reading: 'reading' })).toEqual(d);
  });
  it('removes books', () => {
    expect(removeItems([item('a'), item('b')], new Set(['a'])).map((x) => x.workId)).toEqual(['b']);
  });
});

describe('stats', () => {
  const d = [
    item('a'), item('b', { ownership: 'digital' }), item('c', { ownership: 'both', reading: 'reading' }),
    item('d', { ownership: 'wishlist' }), item('e', { reading: 'finished' }),
  ];
  const s = draftStats(d);
  it('counts formats, with "both" in physical and digital', () => {
    expect(s).toMatchObject({ total: 5, physical: 3, digital: 2, wishlist: 1, owned: 4 });
  });
  it('a wishlist book is never on the unread pile', () => {
    expect(s.unread).toBe(2); // a, b — not d
    expect(s.reading).toBe(1);
    expect(s.finished).toBe(1);
  });
  it('is all zeros for nothing', () => {
    expect(draftStats([])).toEqual({ total: 0, physical: 0, digital: 0, wishlist: 0, owned: 0, unread: 0, reading: 0, finished: 0 });
  });
  it('reads back in plain words', () => {
    expect(libraryReadySummary(s)).toBe('4 owned · 2 unread · 1 in progress · 1 finished · 1 on your wishlist');
    expect(libraryReadySummary(draftStats([]))).toMatch(/empty/);
  });
});

describe('writing to the library', () => {
  it('sets fields for a new book', () => {
    expect(toLibraryFields(item('a', { reading: 'finished' }), { own: 'none', status: 'none' })).toEqual({ own: 'physical', status: 'done' });
    expect(toLibraryFields(item('a', { ownership: 'wishlist' }), { own: 'none', status: 'none' })).toEqual({ own: 'wishlist', status: 'none' });
  });
  it('adds a format without dropping the one already owned', () => {
    expect(toLibraryFields(item('a', { ownership: 'digital' }), { own: 'physical', status: 'none' }).own).toBe('both');
    expect(toLibraryFields(item('a', { ownership: 'physical' }), { own: 'both', status: 'none' }).own).toBe('both');
  });
  it('never turns something owned back into a wish', () => {
    expect(toLibraryFields(item('a', { ownership: 'wishlist' }), { own: 'digital', status: 'none' }).own).toBe('digital');
  });
  it('owning a wishlist book upgrades it', () => {
    expect(toLibraryFields(item('a', { ownership: 'physical' }), { own: 'wishlist', status: 'none' }).own).toBe('physical');
  });
  it('never moves progress backwards', () => {
    expect(toLibraryFields(item('a', { reading: 'unread' }), { own: 'physical', status: 'done' }).status).toBe('done');
    expect(toLibraryFields(item('a', { reading: 'reading' }), { own: 'physical', status: 'done' }).status).toBe('done');
    expect(toLibraryFields(item('a', { reading: 'finished' }), { own: 'physical', status: 'reading' }).status).toBe('done');
  });
  it('leaves ordered and subscription alone when nothing new is owned', () => {
    expect(toLibraryFields(item('a', { ownership: 'wishlist' }), { own: 'ordered', status: 'none' }).own).toBe('ordered');
  });
});

describe('first pick input', () => {
  it('is owned books that are not finished', () => {
    const d = [item('a'), item('b', { ownership: 'wishlist' }), item('c', { reading: 'finished' }), item('d', { reading: 'reading' })];
    expect(readableIds(d)).toEqual(['a', 'd']);
  });
});
