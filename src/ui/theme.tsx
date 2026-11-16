import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

export type ThemeCategory = 'default' | 'hero' | 'villain';
export type ThemeColors = { background: string; surface: string; surfaceRaised: string; surfaceMuted: string; primary: string; primaryHover: string; primaryMuted: string; primaryForeground: string; secondary: string; secondaryForeground: string; tertiary: string; accent: string; textPrimary: string; textSecondary: string; textMuted: string; border: string; borderActive: string; navActive: string; toggleActive: string; focus: string; progress: string; success: string; warning: string; error: string; destructive: string; overlay: string; shadow: string };
export type ComicPillTheme = { id: string; name: string; subtitle: string; category: ThemeCategory; colors: ThemeColors };
export type TypographyPreset = { id: string; name: string; description: string; display: string; displayMedium: string; body: string; bodyMedium: string; bodySemibold: string };

type PaletteOptions = Partial<Pick<ThemeColors, 'background' | 'surface' | 'surfaceRaised' | 'surfaceMuted' | 'textPrimary' | 'textSecondary' | 'textMuted' | 'border' | 'primaryForeground' | 'secondaryForeground' | 'tertiary' | 'overlay' | 'shadow'>>;

const foregroundFor = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16);
  const brightness = ((value >> 16) & 255) * 0.299 + ((value >> 8) & 255) * 0.587 + (value & 255) * 0.114;
  return brightness > 160 ? '#10151A' : '#FFFFFF';
};

/**
 * Themes are complete semantic palettes, not an accent laid over ComicPill
 * black.  This keeps the layout consistent while allowing the entire reading
 * environment — page, cards, navigation, typography contrast, and states —
 * to change with a theme.
 */
const palette = (primary: string, secondary: string, options: PaletteOptions = {}): ThemeColors => {
  const background = options.background ?? '#0A0A0D';
  const surface = options.surface ?? '#131318';
  const surfaceRaised = options.surfaceRaised ?? '#1B1B22';
  return {
    background, surface, surfaceRaised, surfaceMuted: options.surfaceMuted ?? surfaceRaised,
    primary, primaryHover: primary, primaryMuted: `${primary}2E`, primaryForeground: options.primaryForeground ?? foregroundFor(primary), secondary, secondaryForeground: options.secondaryForeground ?? foregroundFor(secondary), tertiary: options.tertiary ?? (options.textPrimary ?? '#F5F5F7'), accent: options.tertiary ?? (options.textPrimary ?? '#F5F5F7'),
    textPrimary: options.textPrimary ?? '#F5F5F7', textSecondary: options.textSecondary ?? '#9A9AA3', textMuted: options.textMuted ?? '#6B6B75', border: options.border ?? '#FFFFFF16', borderActive: primary,
    navActive: primary, toggleActive: secondary, focus: secondary, progress: primary,
    success: '#4E8C6B', warning: '#C9992F', error: '#E32636', destructive: '#E32636', overlay: options.overlay ?? '#000000AA', shadow: options.shadow ?? '#000000',
  };
};

/**
 * Four themes, all in ComicPill's own voice: one restrained red accent (kept for the main action on a screen and for progress), with the comic
 * art supplying the colour. Dark is the signature look; Black is true black for OLED screens; Paper and Sepia are for daylight.
 * Anyone who had chosen a theme that no longer exists lands on Dark.
 */
export const THEMES: ComicPillTheme[] = [
  { id: 'comicpill', name: 'Dark', subtitle: 'Near-black, warm white, one red', category: 'default', colors: palette('#F23546', '#F5F5F7') },
  { id: 'black', name: 'Black', subtitle: 'True black for OLED screens', category: 'default', colors: palette('#F23546', '#F5F5F7', { background: '#000000', surface: '#0C0C0F', surfaceRaised: '#16161B', surfaceMuted: '#09090B', border: '#FFFFFF14', overlay: '#000000CC', shadow: '#000000' }) },
  { id: 'paper', name: 'Paper', subtitle: 'Bright and clean for daylight', category: 'default', colors: palette('#D61F33', '#16161A', { background: '#F6F4EF', surface: '#FFFFFF', surfaceRaised: '#ECE9E2', surfaceMuted: '#F1EEE8', textPrimary: '#16161A', textSecondary: '#55545C', textMuted: '#8A8890', border: '#1616191A', primaryForeground: '#FFFFFF', overlay: '#16161A88', shadow: '#8C877C' }) },
  { id: 'sepia', name: 'Sepia', subtitle: 'Warm paper, easy on the eyes', category: 'default', colors: palette('#B23A2C', '#33241A', { background: '#F1E7D3', surface: '#FAF3E3', surfaceRaised: '#E6D8BC', surfaceMuted: '#EDE2CC', textPrimary: '#33241A', textSecondary: '#6B5847', textMuted: '#97836E', border: '#33241A1F', primaryForeground: '#FFFFFF', overlay: '#33241A88', shadow: '#8A7350' }) },
];

export const TYPOGRAPHY: TypographyPreset[] = [
  { id: 'polished', name: 'Polished', description: 'Clean, confident and modern.', display: 'Inter_800ExtraBold', displayMedium: 'Inter_700Bold', body: 'Inter_400Regular', bodyMedium: 'Inter_500Medium', bodySemibold: 'Inter_600SemiBold' },
  { id: 'editorial', name: 'Editorial', description: 'Classic comic-journal feel.', display: 'PlayfairDisplay_700Bold', displayMedium: 'PlayfairDisplay_600SemiBold', body: 'Inter_400Regular', bodyMedium: 'Inter_500Medium', bodySemibold: 'Inter_600SemiBold' },
  { id: 'modern', name: 'Modern', description: 'Clean and contemporary.', display: 'Inter_600SemiBold', displayMedium: 'Inter_600SemiBold', body: 'Inter_400Regular', bodyMedium: 'Inter_500Medium', bodySemibold: 'Inter_600SemiBold' },
  { id: 'graphic-novel', name: 'Graphic Novel', description: 'Bold, condensed, and expressive.', display: 'BarlowCondensed_700Bold', displayMedium: 'BarlowCondensed_600SemiBold', body: 'Inter_400Regular', bodyMedium: 'Inter_500Medium', bodySemibold: 'Inter_600SemiBold' },
  { id: 'classic', name: 'Classic', description: 'Traditional publishing feel.', display: 'PlayfairDisplay_700Bold', displayMedium: 'PlayfairDisplay_600SemiBold', body: 'PlayfairDisplay_600SemiBold', bodyMedium: 'Inter_500Medium', bodySemibold: 'Inter_600SemiBold' },
  { id: 'minimal', name: 'Minimal', description: 'Quiet and highly readable.', display: 'Inter_500Medium', displayMedium: 'Inter_500Medium', body: 'Inter_400Regular', bodyMedium: 'Inter_500Medium', bodySemibold: 'Inter_600SemiBold' },
];

type Appearance = {
  theme: ComicPillTheme;
  typography: TypographyPreset;
  savedThemeId: string;
  savedTypographyId: string;
  previewTheme: (id: string) => void;
  previewTypography: (id: string) => void;
  clearPreview: () => void;
  setTheme: (id: string) => void;
  setTypography: (id: string) => void;
  setAppearance: (themeId: string, typographyId: string) => void;
  reset: () => void;
  ready: boolean;
};
const AppearanceContext = createContext<Appearance | null>(null);
const key = '@comicpill/appearance/v1';
const byId = <T extends { id: string }>(items: T[], id: string | null, fallback: T) => items.find((item) => item.id === id) ?? fallback;

export function AppearanceProvider({ children }: PropsWithChildren) {
  const [themeId, setThemeId] = useState('comicpill'); const [typeId, setTypeId] = useState('polished');
  const [previewThemeId, setPreviewThemeId] = useState<string | null>(null); const [previewTypeId, setPreviewTypeId] = useState<string | null>(null); const [ready, setReady] = useState(false);
  useEffect(() => { AsyncStorage.getItem(key).then((raw) => { if (raw) { const value = JSON.parse(raw) as { themeId?: string; typeId?: string }; setThemeId(byId(THEMES, value.themeId ?? null, THEMES[0]).id); setTypeId(byId(TYPOGRAPHY, value.typeId ?? null, TYPOGRAPHY[0]).id); } }).catch(() => {}).finally(() => setReady(true)); }, []);
  const persist = useCallback((nextTheme: string, nextType: string) => { void AsyncStorage.setItem(key, JSON.stringify({ themeId: nextTheme, typeId: nextType })); }, []);
  const clearPreview = useCallback(() => { setPreviewThemeId(null); setPreviewTypeId(null); }, []);
  const previewTheme = useCallback((id: string) => setPreviewThemeId(byId(THEMES, id, THEMES[0]).id), []);
  const previewTypography = useCallback((id: string) => setPreviewTypeId(byId(TYPOGRAPHY, id, TYPOGRAPHY[0]).id), []);
  const setAppearance = useCallback((nextThemeId: string, nextTypeId: string) => {
    const nextTheme = byId(THEMES, nextThemeId, THEMES[0]).id; const nextType = byId(TYPOGRAPHY, nextTypeId, TYPOGRAPHY[0]).id;
    setThemeId(nextTheme); setTypeId(nextType); clearPreview(); persist(nextTheme, nextType);
  }, [clearPreview, persist]);
  const setTheme = useCallback((id: string) => setAppearance(id, typeId), [setAppearance, typeId]);
  const setTypography = useCallback((id: string) => setAppearance(themeId, id), [setAppearance, themeId]);
  const reset = useCallback(() => setAppearance('comicpill', 'polished'), [setAppearance]);
  const shownThemeId = previewThemeId ?? themeId; const shownTypeId = previewTypeId ?? typeId;
  const value = useMemo(() => ({ theme: byId(THEMES, shownThemeId, THEMES[0]), typography: byId(TYPOGRAPHY, shownTypeId, TYPOGRAPHY[0]), savedThemeId: themeId, savedTypographyId: typeId, previewTheme, previewTypography, clearPreview, setTheme, setTypography, setAppearance, reset, ready }), [shownThemeId, shownTypeId, themeId, typeId, previewTheme, previewTypography, clearPreview, setTheme, setTypography, setAppearance, reset, ready]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() { const value = useContext(AppearanceContext); if (!value) throw new Error('useAppearance must be used inside AppearanceProvider'); return value; }

/** The older flat colour names (`color.accent`, `color.bg`…) that many screens' stylesheets use, filled from the active theme. */
export type Palette = {
  bg: string; surface: string; surface2: string; border: string; text: string; muted: string; faint: string;
  accent: string; accentDeep: string; accentPressed: string; positive: string; warning: string; collectGold: string; digital: string; tryDigital: string; danger: string;
  /** Text that sits on `accent`. */
  onAccent: string;
};

export function paletteOf(c: ThemeColors): Palette {
  return {
    bg: c.background, surface: c.surface, surface2: c.surfaceRaised, border: c.border, text: c.textPrimary, muted: c.textSecondary, faint: c.textMuted,
    accent: c.primary, accentDeep: c.primary, accentPressed: c.primaryHover, positive: c.success, warning: c.warning, collectGold: '#D4AF37',
    digital: '#5B87B8', tryDigital: '#8B6BAE', danger: c.destructive, onAccent: c.primaryForeground,
  };
}

/** The font names a stylesheet needs (the chosen typography preset). */
export type Fonts = Pick<TypographyPreset, 'display' | 'displayMedium' | 'body' | 'bodyMedium' | 'bodySemibold'>;

/** A screen's stylesheet, rebuilt when the theme or the font changes: `const { color, font, styles } = useThemed(makeStyles)`. */
export function useThemed<S>(make: (color: Palette, font: Fonts) => S): { color: Palette; font: Fonts; styles: S } {
  const { theme, typography } = useAppearance();
  const color = useMemo(() => paletteOf(theme.colors), [theme.colors]);
  const font = typography;
  const styles = useMemo(() => make(color, font), [make, color, font]);
  return { color, font, styles };
}
