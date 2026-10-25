import { describe, expect, it } from 'vitest';
import { BUILTIN_PRESETS, resolveReading, type Preset } from './presets';

const custom: Preset = { id: 'c1', name: 'Night manga', mode: 'rtl', fit: 'width', background: 'black' };
const presets = [...BUILTIN_PRESETS, custom];
const base = { comicMode: 'ltr' as const, comicPresetId: null, folderPresetId: null, defaultPresetId: 'western', presets };

describe('resolveReading', () => {
  it('uses the comic mode with the default look when no preset applies', () => {
    expect(resolveReading({ ...base, comicMode: 'rtl' })).toEqual({ mode: 'rtl', fit: 'contain', background: 'dark', presetName: null });
  });
  it('a folder preset makes its comics open that way', () => {
    expect(resolveReading({ ...base, folderPresetId: 'manga' }).mode).toBe('rtl');
  });
  it('a comic preset beats the folder preset', () => {
    expect(resolveReading({ ...base, comicPresetId: 'c1', folderPresetId: 'webtoon' })).toEqual({ mode: 'rtl', fit: 'width', background: 'black', presetName: 'Night manga' });
  });
  it('ignores a preset that no longer exists', () => {
    expect(resolveReading({ ...base, comicPresetId: 'gone' }).presetName).toBeNull();
  });
});
