import { describe, expect, it } from 'vitest';
import { pickCover } from './pick';

describe('pickCover', () => {
  it('prefers the reader’s own cover over the catalog artwork', () => {
    expect(pickCover('file:///mine.jpg', 7, undefined)).toEqual({ uri: 'file:///mine.jpg' });
  });
  it('falls back to the catalog artwork, then a file cover, then nothing', () => {
    expect(pickCover(undefined, 7, 'file:///page1.jpg')).toBe(7);
    expect(pickCover(undefined, undefined, 'file:///page1.jpg')).toEqual({ uri: 'file:///page1.jpg' });
    expect(pickCover(undefined, undefined, undefined)).toBeUndefined();
  });
});
