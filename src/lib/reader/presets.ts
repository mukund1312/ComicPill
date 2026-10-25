import type { ReaderMode } from './readerLibrary';

export type Fit = 'contain' | 'width';
export type Background = 'dark' | 'black' | 'sepia' | 'white';

export type Preset = { id: string; name: string; mode: ReaderMode; fit: Fit; background: Background; builtin?: boolean };

export const BACKGROUND_COLORS: Record<Background, string> = { dark: '#08090B', black: '#000000', sepia: '#F1E7D0', white: '#FFFFFF' };
export const BACKGROUND_LABEL: Record<Background, string> = { dark: 'Dark', black: 'True black', sepia: 'Sepia', white: 'White' };
export const FIT_LABEL: Record<Fit, string> = { contain: 'Fit page', width: 'Fit width' };
export const MODE_LABEL: Record<ReaderMode, string> = { ltr: 'Left → Right', rtl: 'Manga (RTL)', webtoon: 'Webtoon' };

export const BUILTIN_PRESETS: Preset[] = [
  { id: 'western', name: 'Western', mode: 'ltr', fit: 'contain', background: 'dark', builtin: true },
  { id: 'manga', name: 'Manga', mode: 'rtl', fit: 'contain', background: 'dark', builtin: true },
  { id: 'webtoon', name: 'Webtoon', mode: 'webtoon', fit: 'width', background: 'black', builtin: true },
];
export const DEFAULT_PRESET_ID = 'western';

export type Reading = { mode: ReaderMode; fit: Fit; background: Background; presetName: string | null };

/**
 * How a comic opens. A preset set on the comic wins, then one set on its folder (so a manga folder
 * defaults to RTL). With neither, the comic's own saved mode applies on top of the default preset's look.
 */
export function resolveReading(a: { comicMode: ReaderMode; comicPresetId: string | null; folderPresetId: string | null; defaultPresetId: string; presets: Preset[] }): Reading {
  const find = (id: string | null) => (id ? a.presets.find((p) => p.id === id) : undefined);
  const chosen = find(a.comicPresetId) ?? find(a.folderPresetId);
  if (chosen) return { mode: chosen.mode, fit: chosen.fit, background: chosen.background, presetName: chosen.name };
  const base = find(a.defaultPresetId) ?? BUILTIN_PRESETS[0];
  return { mode: a.comicMode, fit: base.fit, background: base.background, presetName: null };
}
