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

export const THEMES: ComicPillTheme[] = [
  { id: 'comicpill', name: 'ComicPill Original', subtitle: 'Crimson / Ivory', category: 'default', colors: palette('#F23546', '#F5F5F7') },
  { id: 'iron', name: 'Iron', subtitle: 'Crimson / Gold', category: 'hero', colors: palette('#D4AF37', '#F3C969', { background: '#5A0910', surface: '#741018', surfaceRaised: '#8B1821', surfaceMuted: '#681019', textPrimary: '#FFF5DF', textSecondary: '#F0C9A8', textMuted: '#C98779', border: '#A62A30', primaryForeground: '#261306', overlay: '#240205B8', shadow: '#250307' }) },
  { id: 'gotham', name: 'Gotham', subtitle: 'Slate / Steel', category: 'hero', colors: palette('#D6B64C', '#AEB6C1', { background: '#11151C', surface: '#1B222C', surfaceRaised: '#27313D', surfaceMuted: '#161C25', textPrimary: '#F0F3F5', textSecondary: '#B6C0CB', textMuted: '#7D8997', border: '#3A4655', primaryForeground: '#18202A', overlay: '#080B10B8', shadow: '#000000' }) },
  { id: 'krypton', name: 'Krypton', subtitle: 'Cream / Blue / Red', category: 'hero', colors: palette('#1756A9', '#C8202F', { background: '#F4F1E8', surface: '#FFFDF8', surfaceRaised: '#E5E9F1', surfaceMuted: '#ECE7DB', textPrimary: '#10233F', textSecondary: '#4A5B73', textMuted: '#77849A', border: '#C8D1DD', primaryForeground: '#FFFFFF', overlay: '#10233F88', shadow: '#7B8BA1' }) },
  { id: 'amazon', name: 'Amazon', subtitle: 'Parchment / Crimson / Gold', category: 'hero', colors: palette('#9E1B32', '#C9A227', { background: '#F3E8D4', surface: '#FFF8EC', surfaceRaised: '#EAD9BB', surfaceMuted: '#EFE1CC', textPrimary: '#172A46', textSecondary: '#665B52', textMuted: '#948477', border: '#D4C19F', primaryForeground: '#FFFFFF', overlay: '#25160C88', shadow: '#5D4530' }) },
  { id: 'web', name: 'Web', subtitle: 'Red / Blue', category: 'hero', colors: palette('#D22835', '#4B87D1', { background: '#241016', surface: '#36151E', surfaceRaised: '#4A1B26', surfaceMuted: '#2D111A', textPrimary: '#FFF3F1', textSecondary: '#E3B9B9', textMuted: '#AD7C85', border: '#672D3A', overlay: '#100308B8', shadow: '#120207' }) },
  { id: 'emerald', name: 'Emerald', subtitle: 'Forest / Mint', category: 'hero', colors: palette('#23B569', '#BCEFD3', { background: '#071A13', surface: '#102B20', surfaceRaised: '#173A2A', surfaceMuted: '#0B2219', textPrimary: '#EEFFF5', textSecondary: '#B9D9C5', textMuted: '#789E89', border: '#285440', primaryForeground: '#062114', overlay: '#020A06B8', shadow: '#020B06' }) },
  { id: 'speed', name: 'Speed', subtitle: 'Burgundy / Gold', category: 'hero', colors: palette('#F2C230', '#FFF2B2', { background: '#741018', surface: '#921722', surfaceRaised: '#AD2730', surfaceMuted: '#83121C', textPrimary: '#FFF8E8', textSecondary: '#F4D1A8', textMuted: '#CF9878', border: '#C33C42', primaryForeground: '#3E0B0E', overlay: '#2D0408B8', shadow: '#300408' }) },
  { id: 'panther', name: 'Panther', subtitle: 'Plum / Silver', category: 'hero', colors: palette('#9B6DCD', '#D8D5E2', { background: '#17121D', surface: '#261A31', surfaceRaised: '#342341', surfaceMuted: '#1D1526', textPrimary: '#FBF5FF', textSecondary: '#D0C4DA', textMuted: '#9583A3', border: '#4C3A5B', overlay: '#09060DB8', shadow: '#08040B' }) },
  { id: 'thunder', name: 'Thunder', subtitle: 'Storm blue / Silver', category: 'hero', colors: palette('#4F9FEF', '#CAD3DF', { background: '#081827', surface: '#10283D', surfaceRaised: '#173650', surfaceMuted: '#0B2033', textPrimary: '#F2F8FF', textSecondary: '#B7CBDE', textMuted: '#7D9BB6', border: '#2F5877', primaryForeground: '#061725', overlay: '#020B14B8', shadow: '#020A12' }) },
  { id: 'liberty', name: 'Liberty', subtitle: 'Navy / Red', category: 'hero', colors: palette('#315A9B', '#C93743', { background: '#0B1729', surface: '#11243D', surfaceRaised: '#183252', surfaceMuted: '#0D1D33', textPrimary: '#F2F5FA', textSecondary: '#BBC8D8', textMuted: '#7A90AA', border: '#2B4B70', overlay: '#020914B8', shadow: '#020812' }) },
  { id: 'chaos', name: 'Chaos', subtitle: 'Aubergine / Acid green', category: 'villain', colors: palette('#9B55D4', '#A6D83A', { background: '#1A1020', surface: '#291533', surfaceRaised: '#3A1F49', surfaceMuted: '#211129', textPrimary: '#FFF7FF', textSecondary: '#DEC6E3', textMuted: '#A17DAA', border: '#59396A', primaryForeground: '#FFFFFF', overlay: '#0A040DB8', shadow: '#09030B' }) },
  { id: 'doom', name: 'Doom', subtitle: 'Stone / Forest / Steel', category: 'villain', colors: palette('#315344', '#8D8D82', { background: '#E7E2D4', surface: '#F7F4EA', surfaceRaised: '#D5D0C1', surfaceMuted: '#DED9CA', textPrimary: '#1A2D26', textSecondary: '#59645D', textMuted: '#7E837B', border: '#B9B3A3', primaryForeground: '#FFFFFF', overlay: '#19251F88', shadow: '#5B6159' }) },
  { id: 'titan', name: 'Titan', subtitle: 'Deep purple / Gold', category: 'villain', colors: palette('#9A62C7', '#D8B85D', { background: '#1B112C', surface: '#2A1A40', surfaceRaised: '#3A2556', surfaceMuted: '#211535', textPrimary: '#FAF5FF', textSecondary: '#D6C6E4', textMuted: '#9680AC', border: '#553C70', overlay: '#08030EB8', shadow: '#08030C' }) },
  { id: 'goblin', name: 'Goblin', subtitle: 'Violet / Green', category: 'villain', colors: palette('#8A4FC3', '#78C957', { background: '#171421', surface: '#251D32', surfaceRaised: '#342744', surfaceMuted: '#1C1727', textPrimary: '#F8F6FF', textSecondary: '#CCC8DC', textMuted: '#8C849E', border: '#4B3B60', overlay: '#07050AB8', shadow: '#060408' }) },
  { id: 'magnetic', name: 'Magnetic', subtitle: 'Wine / Violet', category: 'villain', colors: palette('#B52D45', '#9A70C8', { background: '#260D16', surface: '#38111F', surfaceRaised: '#501929', surfaceMuted: '#2F0E19', textPrimary: '#FFF4F6', textSecondary: '#E7BCC5', textMuted: '#B77C8A', border: '#6C2B39', overlay: '#100307B8', shadow: '#120307' }) },
  { id: 'apokolips', name: 'Apokolips', subtitle: 'Ember / Steel', category: 'villain', colors: palette('#D65A37', '#AAB0B8', { background: '#251713', surface: '#362019', surfaceRaised: '#4B2C22', surfaceMuted: '#2D1B15', textPrimary: '#FFF5EF', textSecondary: '#DEC8BE', textMuted: '#A9897D', border: '#664232', overlay: '#0F0805B8', shadow: '#100805' }) },
  { id: 'symbiote', name: 'Symbiote', subtitle: 'Pearl / Red', category: 'villain', colors: palette('#C82B32', '#32373B', { background: '#E6E9EA', surface: '#F8F9F9', surfaceRaised: '#D3D8DA', surfaceMuted: '#DEE2E3', textPrimary: '#15191B', textSecondary: '#535D62', textMuted: '#7B858A', border: '#BCC4C7', primaryForeground: '#FFFFFF', overlay: '#14171988', shadow: '#747B7E' }) },
  { id: 'reverse', name: 'Reverse', subtitle: 'Gold / Scarlet', category: 'villain', colors: palette('#A94A16', '#F6C632', { background: '#FFF2B8', surface: '#FFF9E5', surfaceRaised: '#F4D673', surfaceMuted: '#FFE9A2', textPrimary: '#3A2107', textSecondary: '#70551F', textMuted: '#9C803E', border: '#D7B84E', primaryForeground: '#FFFFFF', overlay: '#3A210788', shadow: '#9B782C' }) },
  { id: 'freeze', name: 'Freeze', subtitle: 'Ice / Midnight blue', category: 'villain', colors: palette('#267A9F', '#EAF7FC', { background: '#E4F2F7', surface: '#F7FCFE', surfaceRaised: '#CAE3EC', surfaceMuted: '#DCEEF4', textPrimary: '#102A3A', textSecondary: '#486878', textMuted: '#7392A0', border: '#B1D2DD', primaryForeground: '#FFFFFF', overlay: '#102A3A88', shadow: '#67909D' }) },
  { id: 'harlequin', name: 'Harlequin', subtitle: 'Ivory / Crimson', category: 'villain', colors: palette('#BB2538', '#253B63', { background: '#FFF5EC', surface: '#FFFDF8', surfaceRaised: '#F4DCD5', surfaceMuted: '#FBEAE2', textPrimary: '#2D1B24', textSecondary: '#6F5961', textMuted: '#9B7E86', border: '#E5C7C2', primaryForeground: '#FFFFFF', overlay: '#2D1B2488', shadow: '#956F70' }) },
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
