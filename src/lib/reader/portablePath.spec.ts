import { describe, expect, it } from 'vitest';
import { rebase, stableTail } from './portablePath';

const roots = { '/Documents/': 'file:///NEW/Documents/', '/Library/Caches/': 'file:///NEW/Library/Caches/' };

describe('portable paths', () => {
  it('re-points a stale iOS sandbox address at the current one', () => {
    expect(rebase('file:///Old/Containers/Data/Application/AAAA/Documents/comics/x/book', roots)).toBe('file:///NEW/Documents/comics/x/book');
  });
  it('does the same for cache files', () => {
    expect(rebase('file:///Old/Application/AAAA/Library/Caches/comics-cache/x/book', roots)).toBe('file:///NEW/Library/Caches/comics-cache/x/book');
  });
  it('leaves an address that is already right, or one it does not understand, alone', () => {
    expect(rebase('file:///NEW/Documents/comics/x/book', roots)).toBe('file:///NEW/Documents/comics/x/book');
    expect(rebase('content://media/external/file/5', roots)).toBe('content://media/external/file/5');
  });
  it('finds the stable tail of an address', () => {
    expect(stableTail('/data/user/0/com.mukund.comicpill/files/Documents/comics/y/cover.jpg')).toEqual({ marker: '/Documents/', tail: 'comics/y/cover.jpg' });
    expect(stableTail('/elsewhere/file')).toBeNull();
  });
});
