import { describe, expect, it } from 'vitest';
import { pickEvictions } from './evict';

const e = (id: string, mb: number, lastReadAt: number) => ({ id, bytes: mb * 1e6, lastReadAt });

describe('cloud cache eviction', () => {
  it('drops nothing while everything fits', () => { expect(pickEvictions([e('a', 100, 1), e('b', 100, 2)], 500e6, 'b')).toEqual([]); });
  it('drops the least recently read first, until the rest fit', () => {
    expect(pickEvictions([e('a', 400, 1), e('b', 400, 2), e('c', 400, 3)], 900e6, 'c')).toEqual(['a']);
    expect(pickEvictions([e('a', 400, 1), e('b', 400, 2), e('c', 400, 3)], 500e6, 'c')).toEqual(['a', 'b']);
  });
  it('never drops the book being opened, even if it alone is over the limit', () => {
    expect(pickEvictions([e('a', 900, 1), e('big', 3000, 9)], 1000e6, 'big')).toEqual(['a']);
  });
});
