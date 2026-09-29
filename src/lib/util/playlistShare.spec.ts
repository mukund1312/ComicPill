import { describe, expect, it } from 'vitest';
import { encodePlaylistShare, decodePlaylistShare, resolveSharedItems } from './playlistShare';

describe('playlist share codec', () => {
  it('round-trips name and items through encode/decode', () => {
    const items = [
      { workId: 'abs-batman-1', title: 'Absolute Batman Vol. 1: The Zoo' },
      { workId: 'watchmen', title: 'Watchmen — the deluxe edition' },
    ];
    const code = encodePlaylistShare('Rainy Sunday', items);
    expect(code.startsWith('PILL1:')).toBe(true);
    const decoded = decodePlaylistShare(code);
    expect(decoded).toEqual({ v: 1, name: 'Rainy Sunday', items });
  });

  it('rejects garbage input instead of throwing', () => {
    expect(decodePlaylistShare('not a real code')).toBeNull();
    expect(decodePlaylistShare('PILL1:not-valid-base64-json!!!')).toBeNull();
    expect(decodePlaylistShare('')).toBeNull();
  });

  it('resolves by id first, falls back to loose title match, else reports unresolved', () => {
    const catalog = new Map([
      ['abs-batman-1', 'Absolute Batman Vol. 1: The Zoo'],
      ['watchmen', 'Watchmen'],
    ]);
    const { resolved, unresolved } = resolveSharedItems(
      [
        { workId: 'abs-batman-1', title: 'stale cached title, ignored on id match' },
        { workId: 'some-other-device-id', title: '  Watchmen  ' }, // id unknown here, title matches loosely
        { workId: 'nope', title: 'Totally Unowned Book' },
      ],
      catalog,
    );
    expect(resolved).toEqual([
      { workId: 'abs-batman-1', title: 'Absolute Batman Vol. 1: The Zoo', matchedBy: 'id' },
      { workId: 'watchmen', title: '  Watchmen  ', matchedBy: 'title' },
    ]);
    expect(unresolved).toEqual([{ workId: 'nope', title: 'Totally Unowned Book' }]);
  });
});
