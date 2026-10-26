// The frame for a settings-style page: safe area, a real back control, a
// title, and a scrolling body that keeps taps working while a keyboard is up.
import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from './tokens';
import { useAppearance } from './theme';
import { Icon } from './Icon';

export function SettingsPage({ title, subtitle, backLabel = 'Back', onBack, children, footer }: PropsWithChildren<{
  title: string; subtitle?: string; backLabel?: string; onBack?: () => void; footer?: ReactNode;
}>) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const bottom = useSafeAreaInsets().bottom;
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 48 + bottom }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
          <Pressable accessibilityRole="button" accessibilityLabel={backLabel} hitSlop={12} onPress={onBack ?? (() => router.back())} style={styles.back}>
            <View style={[styles.backCircle, { backgroundColor: c.surfaceRaised }]}><Icon name="chevron-back" size={20} color={c.textPrimary} /></View>
          </Pressable>
          <Text accessibilityRole="header" style={[styles.title, { color: c.textPrimary, fontFamily: typography.display }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: c.textSecondary, fontFamily: typography.body }]}>{subtitle}</Text> : null}
          <View>{children}</View>
        </ScrollView>
        {footer ? <View style={[styles.footer, { backgroundColor: c.background, borderTopColor: c.border, paddingBottom: space.lg + bottom }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: space.lg, paddingBottom: 48 },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginBottom: 4 },
  backCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 34, letterSpacing: -1, marginTop: 6 },
  subtitle: { fontSize: 15, marginTop: 6, lineHeight: 22 },
  footer: { padding: space.lg, borderTopWidth: StyleSheet.hairlineWidth },
});
