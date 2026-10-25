import { describe, expect, it } from 'vitest';
import { findReaderComic } from './readerLink';

const comics = [{ id: 'a', title: 'Saga Vol 1', series: 'Saga' }, { id: 'b', title: 'Paper Girls 01', series: null }, { id: 'c', title: 'Berserk Deluxe Edition 3', series: 'Berserk' }];
describe('findReaderComic', () => {
  it('finds a file by title or series', () => {
    expect(findReaderComic('Saga', comics)).toBe('a');
    expect(findReaderComic('Berserk', comics)).toBe('c');
  });
  it('does not guess', () => {
    expect(findReaderComic('Watchmen', comics)).toBeNull();
    expect(findReaderComic('Paper', [{ id: 'z', title: 'Paperboy', series: null }])).toBeNull();
  });
});
