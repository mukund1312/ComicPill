import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppearance, THEMES, TYPOGRAPHY, type ComicPillTheme, type TypographyPreset } from '../../ui/theme';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { feedback } from '../../lib/platform/feedback';
import { radius, space, type } from '../../ui/tokens';
import { ThemeEmblem } from '../../ui/ThemeEmblem';
import { BackButton } from '../../ui/Icon';

export default function AppearanceScreen() {
  const appearance = useAppearance(); const { colors } = appearance.theme;
  const { savedThemeId, savedTypographyId, clearPreview } = appearance;
  // Tapping a card previews it across the whole app; Apply (right under that card) keeps it, Cancel goes back to what you had.
  const [draftThemeId, setDraftThemeId] = useState(savedThemeId); const [draftTypographyId, setDraftTypographyId] = useState(savedTypographyId);
  useEffect(() => () => clearPreview(), [clearPreview]);
  const chooseTheme = (id: string) => { feedback.select(); setDraftThemeId(id); appearance.previewTheme(id); };
  const chooseTypography = (id: string) => { feedback.select(); setDraftTypographyId(id); appearance.previewTypography(id); };
  const applyTheme = () => { appearance.setAppearance(draftThemeId, savedTypographyId); setDraftTypographyId(savedTypographyId); feedback.success(); };
  const applyTypography = () => { appearance.setAppearance(savedThemeId, draftTypographyId); setDraftThemeId(savedThemeId); feedback.success(); };
  const cancelTheme = () => { setDraftThemeId(savedThemeId); appearance.previewTheme(savedThemeId); };
  const cancelTypography = () => { setDraftTypographyId(savedTypographyId); appearance.previewTypography(savedTypographyId); };
  const goBack = () => { appearance.clearPreview(); router.back(); };
  const t = appearance.typography;
  const themeCard = (theme: ComicPillTheme) => (
    <View key={theme.id}>
      <ThemePreview theme={theme} active={draftThemeId === theme.id} current={savedThemeId === theme.id} typography={t} onPress={() => chooseTheme(theme.id)} />
      {draftThemeId === theme.id && draftThemeId !== savedThemeId ? <ApplyBar label={`Apply ${theme.name}`} colors={colors} typography={t} onApply={applyTheme} onCancel={cancelTheme} /> : null}
    </View>
  );
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}><ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.content}>
    <BackButton onPress={goBack} label="Settings" />
    <Text style={[styles.title, { color: colors.textPrimary, fontFamily: t.display }]}>Appearance</Text>
    <Text style={[styles.copy, { color: colors.textSecondary, fontFamily: t.body }]}>Tap a theme or a font to try it on the whole app, then Apply right under it to keep it.</Text>
    <Text style={[styles.label, { color: colors.textMuted, fontFamily: t.bodySemibold }]}>COLOR THEME</Text>
    {THEMES.map(themeCard)}
    <Text style={[styles.label, { color: colors.textMuted, fontFamily: t.bodySemibold }]}>TYPOGRAPHY</Text>
    {TYPOGRAPHY.map((preset) => (
      <View key={preset.id}>
        <TypePreview preset={preset} active={draftTypographyId === preset.id} current={savedTypographyId === preset.id} colors={colors} onPress={() => chooseTypography(preset.id)} />
        {draftTypographyId === preset.id && draftTypographyId !== savedTypographyId ? <ApplyBar label={`Apply ${preset.name}`} colors={colors} typography={t} onApply={applyTypography} onCancel={cancelTypography} /> : null}
      </View>
    ))}
    <Pressable onPress={() => { appearance.setAppearance('comicpill', 'polished'); setDraftThemeId('comicpill'); setDraftTypographyId('polished'); feedback.success(); }} style={[styles.reset, { borderColor: colors.border }]}><Text style={{ color: colors.textSecondary, fontFamily: t.bodySemibold }}>Back to the default look</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

/** Shown right under the card you just tapped: keep it, or go back to what you had. */
function ApplyBar({ label, colors, typography, onApply, onCancel }: { label: string; colors: ComicPillTheme['colors']; typography: TypographyPreset; onApply: () => void; onCancel: () => void }) {
  return (
    <Animated.View entering={FadeInDown.duration(180)} style={styles.applyRow}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onApply} style={[styles.applyBtn, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground, fontFamily: typography.bodySemibold, fontSize: type.body }}>{label}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={onCancel} style={[styles.cancelBtn, { borderColor: colors.border }]}><Text style={{ color: colors.textSecondary, fontFamily: typography.bodySemibold, fontSize: type.body }}>Cancel</Text></Pressable>
    </Animated.View>
  );
}

function ThemePreview({ theme, active, current, typography, onPress }: { theme: ComicPillTheme; active: boolean; current: boolean; typography: TypographyPreset; onPress?: () => void }) {
  const c = theme.colors;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${theme.name} theme`} accessibilityState={{ selected: active }} onPress={onPress} style={[styles.theme, { backgroundColor: c.surface, borderColor: active ? c.primary : c.border, borderWidth: active ? 2 : 1 }]}><View style={[styles.preview, { backgroundColor: c.background }]}><View style={styles.emblem}><ThemeEmblem id={theme.id} /></View><Text style={[styles.previewBrand, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>Comic<Text style={{ color: c.primary }}>Pill</Text></Text><View style={[styles.previewBar, { backgroundColor: c.primary }]} /><View style={[styles.previewButton, { backgroundColor: c.secondary }]}><Text style={{ color: c.secondaryForeground, fontFamily: typography.bodySemibold }}>Read Tonight</Text></View></View><View style={[styles.themeMeta, { backgroundColor: c.surface }]}><View><Text style={[styles.themeName, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{theme.name}</Text><Text style={[styles.themeSub, { color: c.textSecondary, fontFamily: typography.body }]}>{theme.subtitle}</Text></View><View style={styles.swatches}>{[c.primary, c.secondary, c.tertiary].map((swatch, index) => <View key={`${swatch}-${index}`} style={[styles.swatch, { backgroundColor: swatch }]} />)}</View></View>{current ? <Text style={[styles.selected, { color: c.primary, fontFamily: typography.bodySemibold }]}>✓ Current theme</Text> : active ? <Text style={[styles.selected, { color: c.textSecondary, fontFamily: typography.bodySemibold }]}>Previewing</Text> : null}</Pressable>;
}

function TypePreview({ preset, active, current, colors, onPress }: { preset: TypographyPreset; active: boolean; current: boolean; colors: ComicPillTheme['colors']; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityLabel={`${preset.name} font`} accessibilityState={{ selected: active }} onPress={onPress} style={[styles.typeCard, { backgroundColor: colors.surface, borderColor: active ? colors.primary : colors.border, borderWidth: active ? 2 : 1 }]}><Text style={{ color: colors.textPrimary, fontFamily: preset.display, fontSize: 23 }}>What are you in the mood for?</Text><Text style={{ color: colors.textSecondary, fontFamily: preset.body, marginTop: 7 }}>Tonight’s Pick · Batman: Dark Victory</Text><View style={styles.typeMeta}><View><Text style={{ color: colors.textPrimary, fontFamily: preset.displayMedium, fontSize: type.subtitle }}>{preset.name}</Text><Text style={{ color: colors.textSecondary, fontFamily: preset.body, fontSize: type.caption }}>{preset.description}</Text></View>{current ? <Text style={{ color: colors.primary, fontFamily: preset.bodySemibold }}>✓ Current</Text> : active ? <Text style={{ color: colors.textSecondary, fontFamily: preset.bodySemibold }}>Previewing</Text> : null}</View></Pressable>; }

const styles = StyleSheet.create({ content: { padding: space.lg, paddingTop: space.lg, paddingBottom: 48 }, back: { marginBottom: 18 }, title: { fontSize: 34 }, copy: { fontSize: type.body, lineHeight: 23, marginTop: 7 }, label: { fontSize: 11, letterSpacing: 1.2, marginTop: space.xxl, marginBottom: space.sm }, theme: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden', marginBottom: space.sm }, preview: { padding: space.md, minHeight: 115 }, emblem: { position: 'absolute', right: 10, top: 8, opacity: .94 }, previewBrand: { fontSize: 21 }, previewBar: { height: 6, width: '66%', borderRadius: 99, marginTop: 14 }, previewButton: { alignSelf: 'flex-start', marginTop: 16, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8 }, themeMeta: { padding: space.md, paddingTop: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, themeName: { fontSize: type.subtitle }, themeSub: { fontSize: type.caption, marginTop: 2 }, swatches: { flexDirection: 'row', gap: 6 }, swatch: { width: 15, height: 15, borderRadius: 8 }, selected: { paddingHorizontal: space.md, paddingBottom: 11, fontSize: type.caption }, typeCard: { padding: space.md, borderWidth: 1, borderRadius: radius.md, marginBottom: space.sm }, typeMeta: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, previewNote: { marginTop: space.lg, marginBottom: space.sm, fontSize: type.caption, textAlign: 'center' }, reset: { alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingVertical: 15, marginTop: space.xl }, applyRow: { flexDirection: 'row', gap: space.sm, marginTop: -2, marginBottom: space.md }, applyBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, minHeight: 48, paddingHorizontal: space.md }, cancelBtn: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, minHeight: 48, paddingHorizontal: space.lg } });
