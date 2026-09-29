import { describe, expect, it } from 'vitest';
import { characterJourney, type LanePosition } from './journey';
import type { ScorableWork } from '../../types/engine-io';

function work(id: string, characters: string[], overrides: Partial<ScorableWork> = {}): ScorableWork {
  return {
    id, title: id, bucket: 'marvelheroes', universe: 'main', fingerprint: null,
    genres: [], creators: [], characters, contextNeeded: 'none', requiredParentIds: [],
    own: 'none', keeper: false, pricePaise: null, formatVerdict: 'digital',
    ...overrides,
  };
}

describe('characterJourney', () => {
  it('matches by case-insensitive substring and excludes non-matching works', () => {
    const ironMan = work('im-1', ['Iron Man']);
    const other = work('other-1', ['Thor']);
    const picks = characterJourney([ironMan, other], new Map(), 'iron man', 12);
    expect(picks.map((p) => p.work.id)).toEqual(['im-1']);
    expect(picks[0].reason).toMatch(/journey/);
  });

  it('orders the selected set by lane position, grouped by lane', () => {
    const positions = new Map<string, LanePosition>([
      ['im-3', { bucket: 'marvelheroes', position: 30 }],
      ['im-1', { bucket: 'marvelheroes', position: 10 }],
      ['im-2', { bucket: 'marvelheroes', position: 20 }],
      ['im-crossover', { bucket: 'other', position: 5 }], // different lane, sorts after by bucket string
    ]);
    const works = [
      work('im-3', ['Iron Man']), work('im-1', ['Iron Man']),
      work('im-2', ['Iron Man']), work('im-crossover', ['Iron Man'], { bucket: 'other' }),
    ];
    const picks = characterJourney(works, positions, 'Iron Man', 12);
    expect(picks.map((p) => p.work.id)).toEqual(['im-1', 'im-2', 'im-3', 'im-crossover']);
  });

  it('caps at count, preferring keeper and accessible works', () => {
    const works = [
      work('a', ['Iron Man'], { keeper: false, own: 'none' }),
      work('b', ['Iron Man'], { keeper: true, own: 'none' }),
      work('c', ['Iron Man'], { keeper: true, own: 'digital' }),
    ];
    const picks = characterJourney(works, new Map(), 'Iron Man', 2);
    expect(picks.length).toBe(2);
    expect(picks.map((p) => p.work.id).sort()).toEqual(['b', 'c']);
  });

  it('returns nothing for a blank query instead of matching everything', () => {
    const works = [work('a', ['Iron Man'])];
    expect(characterJourney(works, new Map(), '   ', 12)).toEqual([]);
  });
});
