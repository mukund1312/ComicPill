import { describe, expect, it } from 'vitest';
import { dedupeLines, groupSpines, readShelf, splitVolume, toPhotoFrame, type ReadPass } from './spines';
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
