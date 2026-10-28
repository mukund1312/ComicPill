import { describe, expect, it } from 'vitest';
import { buildIndex, decide, fold, rankCandidates, wordSimilarity } from './candidates';

const catalog = [
  { id: 'hush', title: 'Batman: Hush', creators: ['Jeph Loeb', 'Jim Lee'] },
  { id: 'hush-deluxe', title: 'Batman: Hush Deluxe Edition', creators: ['Jeph Loeb', 'Jim Lee'] },
  { id: 'year-one', title: 'Batman: Year One', creators: ['Frank Miller', 'David Mazzucchelli'] },
  { id: 'robin-y1', title: 'Robin: Year One', creators: ['Chuck Dixon'] },
  { id: 'sandman-1', title: 'The Sandman Vol. 1: Preludes & Nocturnes', creators: ['Neil Gaiman'] },
  { id: 'sandman-2', title: 'The Sandman Vol. 2: The Doll’s House', creators: ['Neil Gaiman'] },
  { id: 'dkr', title: 'Batman: The Dark Knight Returns', creators: ['Frank Miller'] },
  { id: 'watchmen', title: 'Watchmen', creators: ['Alan Moore', 'Dave Gibbons'] },
];
const index = buildIndex(catalog);
const read = (title: string, rawText = title, volume: string | null = null, creators: string[] = []) => ({ title, volume, creators, rawText });

describe('wordSimilarity', () => {
  it('forgives a letter or two of OCR damage in longer words but not in short ones', () => {
    expect(wordSimilarity('knight', 'knicht')).toBeGreaterThan(0.8);
    expect(wordSimilarity('lantern', 'lanterd')).toBeGreaterThan(0.8);
    expect(wordSimilarity('war', 'car')).toBe(0);
    expect(wordSimilarity('2', '3')).toBe(0);
  });
});

describe('rankCandidates / decide', () => {
  it('matches through typos and a credits line run into the title', () => {
    const d = decide(rankCandidates(read('BATMAN THE DARK KNICHT RETURNS MILLER JANSON VARLEY'), index));
    expect(d.best?.id).toBe('dkr');
    expect(d.strength).toBe('strong');
  });
  it('tells Batman: Year One from Robin: Year One', () => {
    expect(decide(rankCandidates(read('BAIMAN: YEAR ONE', 'BAIMAN: YEAR ONE MILLER MAZZUCCHELLI', null, ['MILLER', 'MAZZUCCHELLI']), index)).best?.id).toBe('year-one');
  });
  it('flags an edition that could be either of two close records', () => {
    const d = decide(rankCandidates(read('BATMAN HUSH LOEB LEE'), index));
    expect(['hush', 'hush-deluxe']).toContain(d.best?.id);
    expect(d.editionUncertain).toBe(true);
  });
  it('prefers the deluxe record when the spine says deluxe', () => {
    expect(rankCandidates(read('BATMAN: HUSH DELUXE EDITION'), index)[0].id).toBe('hush-deluxe');
  });
  it('offers the series, never an automatic match, when the spine names only the series', () => {
    const d = decide(rankCandidates(read('THE SANDMAN NEIL GAIMAN'), index));
    expect(d.strength === 'possible' || d.strength === 'likely').toBe(true);
    expect(d.strength).not.toBe('strong');
    expect([d.best, ...d.alternatives].map((c) => c?.id)).toEqual(expect.arrayContaining(['sandman-1', 'sandman-2']));
  });
  it('does not match a title that is not in the catalog', () => {
    expect(decide(rankCandidates(read('ABSOLUTELY UNKNOWN BOOK'), index)).best).toBeNull();
  });
  it('treats a one-word title as the title, not as something mentioned in the credits', () => {
    expect(decide(rankCandidates(read('SOMETHING ELSE', 'SOMETHING ELSE WATCHMEN'), index)).best?.id).not.toBe('watchmen');
  });
  it('folds accents and punctuation', () => { expect(fold('Nocturnes & Preludes: Épée')).toEqual(['nocturnes', 'and', 'preludes', 'epee']); });
});
