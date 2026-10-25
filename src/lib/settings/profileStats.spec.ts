import { describe, expect, it } from 'vitest';
import { formatDay, historyLine, monthProgress, personaFor, ratingWord, sortHistory, tasteBars, type HistoryRow } from './profileStats';
import { emptyProfile } from '../engines/taste/profile';
import type { TasteProfile } from '../types/engine-io';

const profile = (over: Partial<TasteProfile> = {}, genres: Record<string, { score: number; seen: number }> = {}): TasteProfile => {
  const p = emptyProfile();
  p.affinities.genre = genres;
  return { ...p, ...over };
};

describe('tasteBars', () => {
  it('is empty for a profile that has learned nothing (no invented taste)', () => {
    expect(tasteBars(emptyProfile())).toEqual([]);
  });
  it('shows only observed, positive genres, strongest first, capped', () => {
    const p = profile({}, {
      mystery: { score: 0.8, seen: 5 }, horror: { score: 0.4, seen: 2 }, comedy: { score: -0.5, seen: 3 },
      war: { score: 0.9, seen: 0 }, 'sci-fi': { score: 0.6, seen: 2 }, drama: { score: 0.3, seen: 1 }, mythic: { score: 0.2, seen: 1 },
    });
    expect(tasteBars(p, 4).map((b) => b.label)).toEqual(['Mystery', 'Sci-fi', 'Horror', 'Drama']);
    expect(tasteBars(p, 2)).toHaveLength(2);
  });
  it('keeps values within 0..1', () => {
    expect(tasteBars(profile({}, { mystery: { score: 4, seen: 1 } }))[0].value).toBe(1);
  });
});

describe('personaFor', () => {
  it('a new reader is a newcomer, not an "Explorer"', () => {
    expect(personaFor(profile({ adventurousness: 0.9 }), 1).title).toBe('The Newcomer');
    expect(personaFor(profile(), 2).title).toBe('The Newcomer');
  });
  it('derives from adventurousness once there is history', () => {
    expect(personaFor(profile({ adventurousness: 0.8 }), 10).title).toBe('The Explorer');
    expect(personaFor(profile({ adventurousness: 0.2 }), 10).title).toBe('The Loyalist');
    expect(personaFor(profile({ adventurousness: 0.5 }), 10).title).toBe('The Balanced Reader');
  });
  it('mentions the genre they lean toward, only when there is one', () => {
    expect(personaFor(profile({ adventurousness: 0.8 }, { mystery: { score: 0.7, seen: 3 } }), 10).copy).toContain('mystery');
    expect(personaFor(profile({ adventurousness: 0.8 }), 10).copy).not.toContain('coming back');
  });
});

describe('monthProgress', () => {
  const now = new Date(2026, 8, 15, 12); // 15 Sep 2026, local
  const d = (y: number, m: number, day: number) => new Date(y, m, day, 12).toISOString();
  it('counts only this calendar month', () => {
    const r = monthProgress([d(2026, 8, 2), d(2026, 8, 10), d(2026, 7, 30), d(2025, 8, 10), null], 4, now);
    expect(r.count).toBe(2);
    expect(r.ratio).toBe(0.5);
    expect(r.message).toBe('2 to go this month.');
  });
  it('reports the goal reached, and never exceeds a full bar', () => {
    const r = monthProgress([d(2026, 8, 1), d(2026, 8, 2), d(2026, 8, 3)], 2, now);
    expect(r.ratio).toBe(1);
    expect(r.message).toBe('Goal reached — nice.');
  });
  it('is safe with bad input', () => {
    expect(monthProgress(['not a date', null], 0, now)).toMatchObject({ count: 0, goal: 1, ratio: 0 });
  });
});

describe('formatDay', () => {
  const now = new Date(2026, 8, 15, 12);
  it('speaks in human terms', () => {
    expect(formatDay(new Date(2026, 8, 15, 8).toISOString(), now)).toBe('Today');
    expect(formatDay(new Date(2026, 8, 14, 23).toISOString(), now)).toBe('Yesterday');
    expect(formatDay(new Date(2026, 8, 2, 8).toISOString(), now)).toBe('2 Sep');
    expect(formatDay(new Date(2025, 11, 25, 8).toISOString(), now)).toBe('25 Dec 2025');
    expect(formatDay(null, now)).toBe('Recently');
    expect(formatDay('garbage', now)).toBe('Recently');
  });
});

describe('history', () => {
  const now = new Date(2026, 8, 15, 12);
  const row = (over: Partial<HistoryRow>): HistoryRow => ({ workId: 'w', title: 'W', status: 'done', rating: null, finishedAt: null, updatedAt: '2026-09-01T00:00:00Z', ...over });
  it('sorts most recent first using the finish date when there is one', () => {
    const rows = sortHistory([
      row({ workId: 'a', title: 'A', finishedAt: '2026-08-01T00:00:00Z' }),
      row({ workId: 'b', title: 'B', finishedAt: '2026-09-10T00:00:00Z' }),
      row({ workId: 'c', title: 'C', status: 'reading', updatedAt: '2026-09-05T00:00:00Z' }),
    ]);
    expect(rows.map((r) => r.workId)).toEqual(['b', 'c', 'a']);
  });
  it('describes a finished, rated book and a book in progress', () => {
    expect(historyLine(row({ finishedAt: new Date(2026, 8, 14, 9).toISOString(), rating: 5 }), now)).toBe('Finished Yesterday · Loved it');
    expect(historyLine(row({ status: 'reading', updatedAt: new Date(2026, 8, 2, 9).toISOString() }), now)).toBe('Reading since 2 Sep');
    expect(historyLine(row({ finishedAt: null, updatedAt: 'nope' }), now)).toBe('Finished recently');
  });
  it('maps ratings to words', () => {
    expect(ratingWord(5)).toBe('Loved it');
    expect(ratingWord(null)).toBeNull();
    expect(ratingWord(9)).toBeNull();
  });
});
