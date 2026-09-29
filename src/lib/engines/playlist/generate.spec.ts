import { describe, expect, it } from 'vitest';
import { generatePlaylist } from './generate';
import { emptyProfile } from '../taste/profile';
import type { ScorableWork } from '../../types/engine-io';
import type { Genre } from '../../types/domain';

function work(id: string, overrides: Partial<ScorableWork> = {}): ScorableWork {
  return {
    id, title: id, bucket: 'other', universe: 'main', fingerprint: null,
    genres: [] as Genre[], creators: [`creator-${id}`], characters: [`character-${id}`],
    contextNeeded: 'none', requiredParentIds: [], own: 'none', keeper: false,
    pricePaise: null, formatVerdict: 'digital',
    ...overrides,
  };
}

describe('generatePlaylist', () => {
  it('boosts works matching the requested mood over non-matching ones', () => {
    const dark = work('dark-1', { genres: ['horror'] });
    const fun = work('fun-1', { genres: ['comedy'] });
    const picks = generatePlaylist([fun, dark], emptyProfile(), { mood: 'dark', count: 5 });
    expect(picks[0].work.id).toBe('dark-1');
    expect(picks[0].reason).toMatch(/dark/);
  });

  it('a seed name (character/creator) ranks matches first and allows them to overlap', () => {
    const batman1 = work('b1', { characters: ['Batman'], creators: ['Writer A'] });
    const batman2 = work('b2', { characters: ['Batman'], creators: ['Writer A'] });
    const other = work('o1', { characters: ['Someone Else'] });
    const picks = generatePlaylist([other, batman1, batman2], emptyProfile(), { seedName: 'Batman', count: 5 });
    expect(picks.map((p) => p.work.id)).toEqual(['b1', 'b2', 'o1']);
  });

  it('excludes given workIds and respects the requested count', () => {
    const works = [work('a'), work('b'), work('c')];
    const picks = generatePlaylist(works, emptyProfile(), { count: 2, excludeWorkIds: new Set(['a']) });
    expect(picks.length).toBe(2);
    expect(picks.some((p) => p.work.id === 'a')).toBe(false);
  });

  it('diversifies by creator/character for taste-only playlists (no seed)', () => {
    const a = work('a', { creators: ['Same Writer'] });
    const b = work('b', { creators: ['Same Writer'] }); // same creator as a — should be skipped
    const c = work('c', { creators: ['Different Writer'] });
    const picks = generatePlaylist([a, b, c], emptyProfile(), { count: 5 });
    expect(picks.map((p) => p.work.id)).toEqual(['a', 'c']);
  });

  it('ownedOnly filters to accessible works', () => {
    const owned = work('owned', { own: 'digital' });
    const wishlist = work('wishlisted', { own: 'wishlist' });
    const picks = generatePlaylist([owned, wishlist], emptyProfile(), { count: 5, ownedOnly: true });
    expect(picks.map((p) => p.work.id)).toEqual(['owned']);
  });
});
