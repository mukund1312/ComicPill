import { getMeta, setMeta } from '../db/queries/meta';
import { sqlite } from '../db/client';
import { BUILTIN_PRESETS, DEFAULT_PRESET_ID, type Background, type Fit, type Preset } from './presets';
import type { ReaderMode } from './readerLibrary';

export type ReaderSettings = {
  /** No progress saved, nothing in Reading Now. */
  incognito: boolean;
  /** Edge taps turn pages. Off leaves only the centre tap (overlay). */
  tapZones: boolean;
  /** Swap which edge goes forward. */
  invertTaps: boolean;
  defaultPresetId: string;
  /** How pages change: slide (the swipe itself), fade, a 3-D page flip, or a physical page curl. */
  pageAnimation: PageAnimation;
  /** 0.2–1: dims the page without touching the phone's own brightness. */
  brightness: number;
  filter: ReaderFilter;
  /** Cut the blank margin off each page. */
  trimBorders: boolean;
  /** Tap a speech balloon to bring it up close. */
  bubbleZoom: boolean;
  /** Guided reading: how the rest of the page looks while one panel is up (dimmed, hidden behind a solid colour, or left alone). */
  guidedMask: GuidedMask;
  /** Turned sideways: two pages side by side like an open book, or one page filling the screen. */
  landscapeLayout: LandscapeLayout;
  /** How big a balloon is when lifted: 1 is the automatic fit, less is smaller, more is larger. */
  bubbleSize: number;
  /** How long the camera takes to move between panels, in milliseconds. */
  guidedMs: number;
  /** How long a whole new page is shown before the camera moves into its first panel, in milliseconds (0 goes straight in). */
  bridgeMs: number;
  /** Double-tap focuses the panel under the finger (and, when focused, goes back to the whole page) instead of zooming in. */
  doubleTapPanel: boolean;
};

export type GuidedMask = 'none' | 'dim' | 'solid';
export type LandscapeLayout = 'spread' | 'single';

export type PageAnimation = 'slide' | 'fade' | 'flip' | 'curl';
export type ReaderFilter = 'none' | 'sepia' | 'gray' | 'invert' | 'contrast';

const KEY = 'reader_settings';
export const DEFAULT_SETTINGS: ReaderSettings = { incognito: false, tapZones: true, invertTaps: false, defaultPresetId: DEFAULT_PRESET_ID, pageAnimation: 'slide', brightness: 1, filter: 'none', trimBorders: false, bubbleZoom: false, guidedMask: 'dim', landscapeLayout: 'spread', bubbleSize: 1, guidedMs: 320, bridgeMs: 500, doubleTapPanel: true };

export function loadReaderSettings(): ReaderSettings {
  try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(getMeta(KEY) ?? '{}') as Partial<ReaderSettings>) }; } catch { return DEFAULT_SETTINGS; }
}

export function saveReaderSettings(patch: Partial<ReaderSettings>): ReaderSettings {
  const next = { ...loadReaderSettings(), ...patch };
  setMeta(KEY, JSON.stringify(next));
  return next;
}

type PresetRow = { id: string; name: string; mode: string; fit: string; background: string };

export function listPresets(): Preset[] {
  const custom = sqlite.getAllSync<PresetRow>('SELECT id, name, mode, fit, background FROM reader_presets ORDER BY created_at').map((r): Preset => ({
    id: r.id, name: r.name, mode: r.mode as ReaderMode, fit: r.fit as Fit, background: r.background as Background,
  }));
  return [...BUILTIN_PRESETS, ...custom];
}

export function createPreset(p: Omit<Preset, 'id' | 'builtin'>): string {
  const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  sqlite.runSync('INSERT INTO reader_presets (id, name, mode, fit, background, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, p.name, p.mode, p.fit, p.background, Date.now());
  return id;
}

/** Removes a preset and anything that pointed at it. */
export function deletePreset(id: string): void {
  sqlite.runSync('DELETE FROM reader_presets WHERE id = ?', id);
  sqlite.runSync('UPDATE reader_comics SET preset_id = NULL WHERE preset_id = ?', id);
  sqlite.runSync('UPDATE reader_folders SET preset_id = NULL WHERE preset_id = ?', id);
  if (loadReaderSettings().defaultPresetId === id) saveReaderSettings({ defaultPresetId: DEFAULT_PRESET_ID });
}
