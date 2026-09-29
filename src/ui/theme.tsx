import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

export type ThemeCategory = 'default' | 'hero' | 'villain';
export type ThemeColors = { background: string; surface: string; surfaceRaised: string; primary: string; primaryHover: string; primaryMuted: string; primaryForeground: string; secondary: string; accent: string; textPrimary: string; textSecondary: string; textMuted: string; border: string; borderActive: string; navActive: string; toggleActive: string; focus: string; progress: string; success: string; warning: string; error: string; destructive: string };
export type ComicPillTheme = { id: string; name: string; subtitle: string; category: ThemeCategory; colors: ThemeColors };
export type TypographyPreset = { id: string; name: string; description: string; display: string; displayMedium: string; body: string; bodyMedium: string; bodySemibold: string };

const dark = (primary: string, secondary: string, accent = '#F1EDE6'): ThemeColors => ({
  background: '#08090B', surface: '#101114', surfaceRaised: '#17181C', primary, primaryHover: primary, primaryMuted: `${primary}35`, primaryForeground: '#FFFFFF', secondary, accent,
  textPrimary: '#F1EDE6', textSecondary: '#A6A3A0', textMuted: '#6F6D6A', border: '#27282D', borderActive: primary, navActive: primary, toggleActive: primary, focus: secondary, progress: primary,
  success: '#4E8C6B', warning: '#C9992F', error: '#E32636', destructive: '#E32636',
});

export const THEMES: ComicPillTheme[] = [
  { id: 'comicpill', name: 'ComicPill Original', subtitle: 'Crimson / Ivory', category: 'default', colors: dark('#E32636', '#F1EDE6') },
  ...[['iron', 'Iron', 'Armor red / Gold', '#A91622', '#D9A63B'], ['gotham', 'Gotham', 'Charcoal / Yellow', '#C9A227', '#AEB6C1'], ['krypton', 'Krypton', 'Blue / Red', '#2E6EDB', '#D22B3A'], ['amazon', 'Amazon', 'Crimson / Gold', '#B61D32', '#D5A33A'], ['web', 'Web', 'Red / Blue', '#C92735', '#2D6FCD'], ['emerald', 'Emerald', 'Green / Ice', '#1D9B6C', '#D9F4EA'], ['speed', 'Speed', 'Scarlet / Gold', '#D42A32', '#F2C84B'], ['panther', 'Panther', 'Violet / Silver', '#7046A8', '#C7CDD5'], ['thunder', 'Thunder', 'Electric blue / Silver', '#377FE6', '#CAD3DF'], ['liberty', 'Liberty', 'Navy / Red', '#315A9B', '#C93743']].map(([id, name, subtitle, primary, secondary]) => ({ id, name, subtitle, category: 'hero' as const, colors: dark(primary, secondary) })),
  ...[['chaos', 'Chaos', 'Purple / Acid green', '#6F3CA8', '#A6D83A'], ['doom', 'Doom', 'Forest / Steel', '#2F6B4B', '#AAB5B9'], ['titan', 'Titan', 'Purple / Gold', '#603C95', '#CFA63A'], ['goblin', 'Goblin', 'Purple / Green', '#703F9A', '#78B94D'], ['magnetic', 'Magnetic', 'Crimson / Violet', '#A92A40', '#9160B4'], ['apokolips', 'Apokolips', 'Ember / Steel', '#9E3827', '#AAB0B8'], ['symbiote', 'Symbiote', 'Ivory / Red', '#D9DFE3', '#C82B32'], ['reverse', 'Reverse', 'Gold / Scarlet', '#D4AF35', '#D83A35'], ['freeze', 'Freeze', 'Ice blue / White', '#65B9D6', '#EAF7FC'], ['harlequin', 'Harlequin', 'Crimson / Ivory', '#BB2538', '#F1EDE6']].map(([id, name, subtitle, primary, secondary]) => ({ id, name, subtitle, category: 'villain' as const, colors: dark(primary, secondary) })),
];

export const TYPOGRAPHY: TypographyPreset[] = [
  { id: 'editorial', name: 'Editorial', description: 'Classic comic-journal feel.', display: 'PlayfairDisplay_700Bold', displayMedium: 'PlayfairDisplay_600SemiBold', body: 'Inter_400Regular', bodyMedium: 'Inter_500Medium', bodySemibold: 'Inter_600SemiBold' },
  { id: 'modern', name: 'Modern', description: 'Clean and contemporary.', display: 'Inter_600SemiBold', displayMedium: 'Inter_600SemiBold', body: 'Inter_400Regular', bodyMedium: 'Inter_500Medium', bodySemibold: 'Inter_600SemiBold' },
  { id: 'graphic-novel', name: 'Graphic Novel', description: 'Bold, condensed, and expressive.', display: 'BarlowCondensed_700Bold', displayMedium: 'BarlowCondensed_600SemiBold', body: 'Inter_400Regular', bodyMedium: 'Inter_500Medium', bodySemibold: 'Inter_600SemiBold' },
  { id: 'classic', name: 'Classic', description: 'Traditional publishing feel.', display: 'PlayfairDisplay_700Bold', displayMedium: 'PlayfairDisplay_600SemiBold', body: 'PlayfairDisplay_600SemiBold', bodyMedium: 'Inter_500Medium', bodySemibold: 'Inter_600SemiBold' },
  { id: 'minimal', name: 'Minimal', description: 'Quiet and highly readable.', display: 'Inter_500Medium', displayMedium: 'Inter_500Medium', body: 'Inter_400Regular', bodyMedium: 'Inter_500Medium', bodySemibold: 'Inter_600SemiBold' },
];

type Appearance = { theme: ComicPillTheme; typography: TypographyPreset; setTheme: (id: string) => void; setTypography: (id: string) => void; reset: () => void; ready: boolean };
const AppearanceContext = createContext<Appearance | null>(null);
const key = '@comicpill/appearance/v1';
const byId = <T extends { id: string }>(items: T[], id: string | null, fallback: T) => items.find((item) => item.id === id) ?? fallback;

export function AppearanceProvider({ children }: PropsWithChildren) {
  const [themeId, setThemeId] = useState('comicpill'); const [typeId, setTypeId] = useState('editorial'); const [ready, setReady] = useState(false);
  useEffect(() => { AsyncStorage.getItem(key).then((raw) => { if (raw) { const value = JSON.parse(raw) as { themeId?: string; typeId?: string }; setThemeId(byId(THEMES, value.themeId ?? null, THEMES[0]).id); setTypeId(byId(TYPOGRAPHY, value.typeId ?? null, TYPOGRAPHY[0]).id); } }).catch(() => {}).finally(() => setReady(true)); }, []);
  const persist = useCallback((nextTheme: string, nextType: string) => { void AsyncStorage.setItem(key, JSON.stringify({ themeId: nextTheme, typeId: nextType })); }, []);
  const setTheme = useCallback((id: string) => { const next = byId(THEMES, id, THEMES[0]).id; setThemeId(next); persist(next, typeId); }, [persist, typeId]);
  const setTypography = useCallback((id: string) => { const next = byId(TYPOGRAPHY, id, TYPOGRAPHY[0]).id; setTypeId(next); persist(themeId, next); }, [persist, themeId]);
  const reset = useCallback(() => { setThemeId('comicpill'); setTypeId('editorial'); persist('comicpill', 'editorial'); }, [persist]);
  const value = useMemo(() => ({ theme: byId(THEMES, themeId, THEMES[0]), typography: byId(TYPOGRAPHY, typeId, TYPOGRAPHY[0]), setTheme, setTypography, reset, ready }), [themeId, typeId, setTheme, setTypography, reset, ready]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() { const value = useContext(AppearanceContext); if (!value) throw new Error('useAppearance must be used inside AppearanceProvider'); return value; }
