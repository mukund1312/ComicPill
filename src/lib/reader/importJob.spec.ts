import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: async () => undefined, deactivateKeepAwake: async () => undefined }));

describe('summarize', () => {
  it('says how many went in, how many were already there and what failed', async () => {
    const { summarize } = await import('./importJob');
    const r = { imported: ['a', 'b'], skipped: ['c', 'd', 'e'], failed: [{ name: 'f.cbz', reason: 'corrupt' }] };
    expect(summarize('Linked', r, false)).toEqual({ text: 'Linked 2 comics · 3 already in your library · 1 couldn’t be added', problems: ['f.cbz: corrupt'] });
    expect(summarize('Linked', { imported: ['a'], skipped: [], failed: [] }, true).text).toBe('Stopped. Linked 1 comic');
  });
});

describe('sourceKeyOf', () => {
  it('matches the same file whatever the letter case, and tells sizes apart', async () => {
    const { sourceKeyOf } = await import('./sourceKey');
    expect(sourceKeyOf('Saga 01.CBZ', 100)).toBe(sourceKeyOf('saga 01.cbz', 100));
    expect(sourceKeyOf('saga 01.cbz', 100)).not.toBe(sourceKeyOf('saga 01.cbz', 101));
  });
});
