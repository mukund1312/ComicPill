import { describe, expect, it } from 'vitest';
import { dedupeLines, groupSpines, readShelf, repeatedSeriesCuts, splitVolume, toPhotoFrame, type ReadPass, type SpineLine } from './spines';
import shelf from './__fixtures__/shelf-synthetic.json';

describe('splitVolume', () => {
  it('takes a volume or issue marker out of a title', () => {
    expect(splitVolume('The Walking Dead Vol. 7')).toEqual({ rest: 'The Walking Dead', volume: 'Vol. 7' });
    expect(splitVolume('Hellboy Vol. 1 Seed of Destruction')).toEqual({ rest: 'Hellboy Seed of Destruction', volume: 'Vol. 1' });
    expect(splitVolume('Saga Book Two')).toEqual({ rest: 'Saga', volume: 'Vol. 2' });
    expect(splitVolume('Batman #404')).toEqual({ rest: 'Batman', volume: 'Vol. 404' });
    expect(splitVolume('Watchmen')).toEqual({ rest: 'Watchmen', volume: null });
  });
});

describe('toPhotoFrame and dedupeLines', () => {
  it('flips an upside-down pass back and keeps one copy of what both passes read', () => {
    const passes: ReadPass[] = [
      { turn: 0, lines: [{ text: 'WATCHMEN', x: 0.2, y: 0.1, w: 0.03, h: 0.3, conf: 1 }] },
      { turn: 180, lines: [{ text: 'WATCHMEN', x: 0.77, y: 0.6, w: 0.03, h: 0.3, conf: 0.8 }] }, // the same place, seen upside down
    ];
    const lines = toPhotoFrame(passes);
    expect(lines[1].x).toBeCloseTo(0.2, 5); expect(lines[1].y).toBeCloseTo(0.1, 5);
    expect(dedupeLines(lines)).toHaveLength(1);
  });
  it('drops low-confidence fragments and marks', () => {
    expect(dedupeLines([{ text: '~', x: 0, y: 0, w: 0.01, h: 0.01 }, { text: 'sneJ', x: 0.5, y: 0.1, w: 0.03, h: 0.1, conf: 0.3 }])).toHaveLength(0);
  });
});

describe('groupSpines', () => {
  it('puts lines in the same stripe on one spine and different stripes on different spines', () => {
    const spines = groupSpines([
      { text: 'BATMAN', x: 0.06, y: 0.1, w: 0.02, h: 0.3 }, { text: 'DC COMICS', x: 0.065, y: 0.7, w: 0.015, h: 0.1 },
      { text: 'Saga', x: 0.11, y: 0.1, w: 0.025, h: 0.1 },
    ]);
    expect(spines).toHaveLength(2);
    expect(spines[0].lines).toHaveLength(2);
  });
});

describe('a shelf read by the device (12 spines, text running down)', () => {
  const books = readShelf((shelf as { passes: ReadPass[] }).passes);
  const find = (needle: string) => books.find((b) => b.title.toLowerCase().includes(needle.toLowerCase()));

  it('finds the titles, one per spine, left to right', () => {
    const expected = ['batman: year one', 'saga', 'watchmen', 'walking dead', 'days of future past', 'preludes', 'spider-man: blue', 'daredevil born again', 'hellboy', 'last man', 'absolute batman'];
    for (const t of expected) expect(find(t), t).toBeTruthy();
    expect(books.length).toBeGreaterThanOrEqual(11);
    expect(books.length).toBeLessThanOrEqual(13);
    const order = ['year one', 'saga', 'watchmen', 'walking dead'].map((t) => books.findIndex((b) => b.title.toLowerCase().includes(t)));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('keeps volume numbers apart from titles, and publishers out of them', () => {
    expect(find('saga')?.title).toBe('Saga');
    expect(find('saga')?.volume).toBe('Vol. 3');
    expect(find('walking dead')?.volume).toBe('Vol. 7');
    expect(find('last man')?.volume).toBe('Vol. 2');
    expect(find('hellboy')?.volume).toBe('Vol. 1');
    for (const b of books) expect(b.title).not.toMatch(/\b(marvel|dc comics|image comics|dark horse)\b/i);
  });
});

describe('repeatedSeriesCuts', () => {
  const ln = (text: string, c: number, w = 0.028): SpineLine => ({ text, x: c - w / 2, y: 0.2, w, h: 0.3, dir: 'down' });
  it('cuts between two titles that start with the same series word, even with a credits line between them', () => {
    const cuts = repeatedSeriesCuts([ln('BATMAN THE CITY OF OWLS', 0.871), ln('SCOTT SNYDER - GREG CAPULLO', 0.885, 0.017), ln('BATMAN DEATH OF THE FAMILY', 0.893)], true);
    expect(cuts).toHaveLength(1);
    expect(cuts[0]).toBeCloseTo(0.882, 3);
  });
  it('cuts between each pair when three books share a series word', () => {
    expect(repeatedSeriesCuts([ln('BATMAN: YEAR ONE', 0.60), ln('BATMAN: EGO AND OTHER TAILS', 0.632), ln('BATMAN: GORDON OF GOTHAM', 0.657)], true)).toHaveLength(2);
  });
  it('leaves one book’s own lines alone: a title and its subtitle, credits, publisher', () => {
    expect(repeatedSeriesCuts([ln('INJUSTICE GODS AMONG US: YEAR ONE', 0.40), ln('THE COMPLETE COLLECTION', 0.41), ln('TAYLOR • RAAPACK • MILLER', 0.42, 0.015), ln('DC COMICS', 0.43, 0.013)], true)).toEqual([]);
    expect(repeatedSeriesCuts([ln('BATMAN', 0.5, 0.05), ln('KNIGHTFALL', 0.52)], true)).toEqual([]); // a one-word series line is not a second title
  });
  it('does not cut the same words read twice', () => {
    expect(repeatedSeriesCuts([ln('BATMAN THE LONG HALLOWEEN', 0.30), ln('BATMAN THE LONG HALLOWEEN', 0.318)], true)).toEqual([]);
  });
});

describe('a spine with one line holding both the title and the credits', () => {
  it('keeps that line as its title instead of vanishing', () => {
    const lines: SpineLine[] = [{ text: 'BATMAN: YEAR ONE OMILLER • MAZZUCCHELLI • LEWIS', x: 0.60, y: 0.2, w: 0.02, h: 0.6, dir: 'down' }, { text: 'DC COMICS', x: 0.605, y: 0.85, w: 0.012, h: 0.07, dir: 'down' }];
    const books = readShelf([{ turn: 0, lines }]);
    expect(books).toHaveLength(1);
    expect(books[0].title).toContain('YEAR ONE');
  });
});
