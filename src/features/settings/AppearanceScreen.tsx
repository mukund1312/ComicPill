import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAppearance, THEMES, TYPOGRAPHY, type ComicPillTheme, type TypographyPreset } from '../../ui/theme';
import { Button } from '../../ui/primitives';
import { radius, space, type } from '../../ui/tokens';

export default function AppearanceScreen() {
  const appearance = useAppearance(); const { colors } = appearance.theme;
  const [draftThemeId, setDraftThemeId] = useState(appearance.savedThemeId); const [draftTypographyId, setDraftTypographyId] = useState(appearance.savedTypographyId);
  const { clearPreview } = appearance;
  useEffect(() => () => clearPreview(), [clearPreview]);
  const chooseTheme = (id: string) => { setDraftThemeId(id); appearance.previewTheme(id); };
  const chooseTypography = (id: string) => { setDraftTypographyId(id); appearance.previewTypography(id); };
  const apply = () => appearance.setAppearance(draftThemeId, draftTypographyId);
  const goBack = () => { appearance.clearPreview(); router.back(); };
  return <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.content}>
    <Text onPress={goBack} style={[styles.back, { color: colors.textSecondary, fontFamily: appearance.typography.bodyMedium }]}>‹ Settings</Text>
    <Text style={[styles.title, { color: colors.textPrimary, fontFamily: appearance.typography.display }]}>Appearance</Text>
    <Text style={[styles.copy, { color: colors.textSecondary, fontFamily: appearance.typography.body }]}>Make ComicPill feel personal. Color and typography always travel independently.</Text>
    <Text style={[styles.label, { color: colors.textMuted, fontFamily: appearance.typography.bodySemibold }]}>COLOR THEME</Text>
    <ThemePreview theme={THEMES.find((theme) => theme.id === 'comicpill')!} active={draftThemeId === 'comicpill'} colors={colors} typography={appearance.typography} onPress={() => chooseTheme('comicpill')} />
    <Text style={[styles.label, { color: colors.textMuted, fontFamily: appearance.typography.bodySemibold }]}>HEROES</Text>
    {THEMES.filter((theme) => theme.category === 'hero').map((theme) => <ThemePreview key={theme.id} theme={theme} active={draftThemeId === theme.id} colors={colors} typography={appearance.typography} onPress={() => chooseTheme(theme.id)} />)}
    <Text style={[styles.label, { color: colors.textMuted, fontFamily: appearance.typography.bodySemibold }]}>VILLAINS</Text>
    {THEMES.filter((theme) => theme.category === 'villain').map((theme) => <ThemePreview key={theme.id} theme={theme} active={draftThemeId === theme.id} colors={colors} typography={appearance.typography} onPress={() => chooseTheme(theme.id)} />)}
    <Text style={[styles.label, { color: colors.textMuted, fontFamily: appearance.typography.bodySemibold }]}>TYPOGRAPHY</Text>
    {TYPOGRAPHY.map((preset) => <TypePreview key={preset.id} preset={preset} active={draftTypographyId === preset.id} colors={colors} onPress={() => chooseTypography(preset.id)} />)}
    <Text style={[styles.previewNote, { color: colors.textSecondary, fontFamily: appearance.typography.body }]}>Changes preview instantly. Apply to keep this combination.</Text>
    <Button onPress={apply}>Apply appearance</Button>
    <Pressable onPress={() => { setDraftThemeId('comicpill'); setDraftTypographyId('editorial'); appearance.previewTheme('comicpill'); appearance.previewTypography('editorial'); }} style={[styles.reset, { borderColor: colors.border }]}><Text style={{ color: colors.textSecondary, fontFamily: appearance.typography.bodySemibold }}>Preview ComicPill Default</Text></Pressable>
  </ScrollView>;
}

function ThemePreview({ theme, active, colors, typography, onPress }: { theme: ComicPillTheme; active: boolean; colors: ComicPillTheme['colors']; typography: TypographyPreset; onPress?: () => void }) {
  const c = theme.colors;
  return <Pressable onPress={onPress} style={[styles.theme, { backgroundColor: c.surface, borderColor: active ? c.primary : colors.border }]}><View style={styles.preview}><Text style={[styles.previewBrand, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>Comic<Text style={{ color: c.primary }}>Pill</Text></Text><View style={[styles.previewBar, { backgroundColor: c.primary }]} /><View style={[styles.previewButton, { backgroundColor: c.primary }]}><Text style={{ color: c.primaryForeground, fontFamily: typography.bodySemibold }}>Read Tonight</Text></View></View><View style={styles.themeMeta}><View><Text style={[styles.themeName, { color: colors.textPrimary, fontFamily: typography.displayMedium }]}>{theme.name}</Text><Text style={[styles.themeSub, { color: colors.textSecondary, fontFamily: typography.body }]}>{theme.subtitle}</Text></View><View style={styles.swatches}>{[c.primary, c.secondary, c.accent].map((swatch) => <View key={swatch} style={[styles.swatch, { backgroundColor: swatch }]} />)}</View></View>{active ? <Text style={[styles.selected, { color: c.primary, fontFamily: typography.bodySemibold }]}>✓ Applied</Text> : null}</Pressable>;
}

function TypePreview({ preset, active, colors, onPress }: { preset: TypographyPreset; active: boolean; colors: ComicPillTheme['colors']; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.typeCard, { backgroundColor: colors.surface, borderColor: active ? colors.primary : colors.border }]}><Text style={{ color: colors.textPrimary, fontFamily: preset.display, fontSize: 23 }}>What are you in the mood for?</Text><Text style={{ color: colors.textSecondary, fontFamily: preset.body, marginTop: 7 }}>Tonight’s Pick · Batman: Dark Victory</Text><View style={styles.typeMeta}><View><Text style={{ color: colors.textPrimary, fontFamily: preset.displayMedium, fontSize: type.subtitle }}>{preset.name}</Text><Text style={{ color: colors.textSecondary, fontFamily: preset.body, fontSize: type.caption }}>{preset.description}</Text></View>{active ? <Text style={{ color: colors.primary, fontFamily: preset.bodySemibold }}>Applied</Text> : null}</View></Pressable>; }

const styles = StyleSheet.create({ content: { padding: space.lg, paddingTop: 60, paddingBottom: 48 }, back: { marginBottom: 18 }, title: { fontSize: 34 }, copy: { fontSize: type.body, lineHeight: 23, marginTop: 7 }, label: { fontSize: 11, letterSpacing: 1.2, marginTop: space.xxl, marginBottom: space.sm }, theme: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden', marginBottom: space.sm }, preview: { padding: space.md, minHeight: 115 }, previewBrand: { fontSize: 21 }, previewBar: { height: 6, width: '66%', borderRadius: 99, marginTop: 14 }, previewButton: { alignSelf: 'flex-start', marginTop: 16, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8 }, themeMeta: { padding: space.md, paddingTop: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, themeName: { fontSize: type.subtitle }, themeSub: { fontSize: type.caption, marginTop: 2 }, swatches: { flexDirection: 'row', gap: 6 }, swatch: { width: 15, height: 15, borderRadius: 8 }, selected: { paddingHorizontal: space.md, paddingBottom: 11, fontSize: type.caption }, typeCard: { padding: space.md, borderWidth: 1, borderRadius: radius.md, marginBottom: space.sm }, typeMeta: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, previewNote: { marginTop: space.lg, marginBottom: space.sm, fontSize: type.caption, textAlign: 'center' }, reset: { alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingVertical: 15, marginTop: space.md } });
