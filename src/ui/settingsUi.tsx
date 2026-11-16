// Building blocks for the profile & settings screens. Every row is a real
// Pressable with a minimum touch target, an accessibility role/state and a
// visible pressed state — none of them is decoration.
import type { PropsWithChildren, ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from './tokens';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { useSheetDrag } from './sheetDrag';
import { useAppearance } from './theme';
import { feedback } from '../lib/platform/feedback';

// ---- sections & rows -----------------------------------------------------------

export function SettingsSection({ title, footer, children }: PropsWithChildren<{ title?: string; footer?: string }>) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  return (
    <View style={styles.section}>
      {title ? <Text style={[styles.sectionTitle, { color: c.textMuted, fontFamily: typography.bodySemibold }]}>{title.toUpperCase()}</Text> : null}
      <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.border }]}>{children}</View>
      {footer ? <Text style={[styles.footer, { color: c.textSecondary, fontFamily: typography.body }]}>{footer}</Text> : null}
    </View>
  );
}

interface RowBase { label: string; detail?: string; last?: boolean; disabled?: boolean }

function RowShell({ label, detail, last, right, onPress, disabled, role, state, destructive }: RowBase & {
  right?: ReactNode; onPress?: () => void; role: 'button' | 'switch'; state?: { checked?: boolean }; destructive?: boolean;
}) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      accessibilityState={{ disabled: !!disabled, ...state }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth }, pressed && { backgroundColor: c.surfaceRaised }, disabled && { opacity: 0.5 }]}
    >
      <View style={styles.rowText}>
        <Text style={[styles.label, { color: destructive ? c.destructive : c.textPrimary, fontFamily: typography.body }]}>{label}</Text>
        {detail ? <Text style={[styles.detail, { color: c.textSecondary, fontFamily: typography.body }]}>{detail}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

export function LinkRow({ label, detail, value, onPress, last }: RowBase & { value?: string; onPress: () => void }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  return (
    <RowShell
      label={label} detail={detail} last={last} role="button"
      onPress={() => { feedback.tap(); onPress(); }}
      right={<View style={styles.rightRow}>{value ? <Text style={[styles.value, { color: c.textSecondary, fontFamily: typography.body }]}>{value}</Text> : null}<Text style={[styles.chevron, { color: c.textMuted }]}>›</Text></View>}
    />
  );
}

export function ToggleRow({ label, detail, value, onChange, last, disabled }: RowBase & { value: boolean; onChange: (next: boolean) => void }) {
  const { theme } = useAppearance();
  const c = theme.colors;
  return (
    <RowShell
      label={label} detail={detail} last={last} disabled={disabled} role="switch" state={{ checked: value }}
      onPress={() => { feedback.select(); onChange(!value); }}
      // The row is the labelled switch for screen readers; the drawn switch is only its picture, so it is not a second unnamed control.
      right={<Switch accessible={false} importantForAccessibility="no-hide-descendants" value={value} disabled={disabled} onValueChange={(v) => { feedback.select(); onChange(v); }} trackColor={{ false: c.border, true: c.primary }} thumbColor={c.primaryForeground} />}
    />
  );
}

export function ActionRow({ label, detail, onPress, last, destructive, disabled }: RowBase & { onPress: () => void; destructive?: boolean }) {
  return <RowShell label={label} detail={detail} last={last} disabled={disabled} destructive={destructive} role="button" onPress={() => { feedback.tap(); onPress(); }} />;
}

/** Read-only fact (no press). */
export function InfoRow({ label, value, detail, last }: RowBase & { value?: string }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  return <RowShell label={label} detail={detail} last={last} role="button" right={value ? <Text style={[styles.value, { color: c.textSecondary, fontFamily: typography.body }]}>{value}</Text> : undefined} />;
}

// ---- choice sheet --------------------------------------------------------------

export interface Choice<T extends string> { id: T; label: string; detail?: string }

/** A bottom sheet of options. Tapping the backdrop or Cancel closes it. */
export function ChoiceSheet<T extends string>({ visible, title, message, choices, selected, onSelect, onClose, footnote }: {
  visible: boolean; title: string; message?: string; choices: Choice<T>[]; selected?: T | null; onSelect: (id: T) => void; onClose: () => void; footnote?: string;
}) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const drag = useSheetDrag(onClose);
  // Never taller than the screen (a phone on its side is short): the choices scroll, and dragging the handle still closes the sheet.
  const maxHeight = useWindowDimensions().height - useSafeAreaInsets().top - space.md;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent supportedOrientations={['portrait', 'landscape']}>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
      <Animated.View style={[styles.sheet, { maxHeight, backgroundColor: c.surface, borderColor: c.border }, drag.style]}>
        <GestureDetector gesture={drag.gesture}>
        <View collapsable={false} style={styles.sheetHead}>
        <View style={[styles.handle, { backgroundColor: c.textMuted }]} />
        <Text style={[styles.sheetTitle, { color: c.textPrimary, fontFamily: typography.display }]}>{title}</Text>
        {message ? <Text style={[styles.detail, { color: c.textSecondary, fontFamily: typography.body, marginBottom: space.sm }]}>{message}</Text> : null}
        </View>
        </GestureDetector>
        <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody} bounces={false}>
        {choices.map((choice) => {
          const on = choice.id === selected;
          return (
            <Pressable
              key={choice.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => { feedback.select(); onSelect(choice.id); }}
              style={({ pressed }) => [styles.choice, { borderColor: on ? c.textPrimary : c.border, backgroundColor: pressed ? c.surfaceRaised : 'transparent' }]}
            >
              <View style={styles.rowText}>
                <Text style={[styles.label, { color: c.textPrimary, fontFamily: typography.bodyMedium }]}>{choice.label}</Text>
                {choice.detail ? <Text style={[styles.detail, { color: c.textSecondary, fontFamily: typography.body }]}>{choice.detail}</Text> : null}
              </View>
              {on ? <Text style={[styles.check, { color: c.textPrimary }]}>✓</Text> : null}
            </Pressable>
          );
        })}
        {footnote ? <Text style={[styles.footer, { color: c.textSecondary, fontFamily: typography.body }]}>{footnote}</Text> : null}
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel}>
          <Text style={[styles.label, { color: c.textSecondary, fontFamily: typography.bodyMedium }]}>Cancel</Text>
        </Pressable>
        </ScrollView>
      </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ---- text field ----------------------------------------------------------------

export function TextField({ label, value, onChangeText, error, hint, multiline, maxLength, autoCapitalize, autoCorrect, placeholder, prefix, secure }: {
  label: string; value: string; onChangeText: (t: string) => void; error?: string; hint?: string; multiline?: boolean; maxLength?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words'; autoCorrect?: boolean; placeholder?: string; prefix?: string; secure?: boolean;
}) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Text style={[styles.fieldLabel, { color: c.textSecondary, fontFamily: typography.bodySemibold }]}>{label}</Text>
        {maxLength ? <Text style={[styles.fieldLabel, { color: value.length > maxLength ? c.error : c.textMuted, fontFamily: typography.body }]}>{value.length}/{maxLength}</Text> : null}
      </View>
      <View style={[styles.inputWrap, { backgroundColor: c.surfaceRaised, borderColor: error ? c.error : c.border }]}>
        {prefix ? <Text style={[styles.prefix, { color: c.textMuted, fontFamily: typography.body }]}>{prefix}</Text> : null}
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          multiline={multiline}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          secureTextEntry={secure}
          placeholder={placeholder}
          placeholderTextColor={c.textMuted}
          style={[styles.input, multiline && styles.multiline, { color: c.textPrimary, fontFamily: typography.body }]}
        />
      </View>
      {error ? <Text accessibilityLiveRegion="polite" style={[styles.fieldNote, { color: c.error, fontFamily: typography.bodyMedium }]}>{error}</Text>
        : hint ? <Text style={[styles.fieldNote, { color: c.textMuted, fontFamily: typography.body }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: space.xl, gap: 8 },
  sectionTitle: { fontSize: 11, letterSpacing: 1.4, paddingHorizontal: 4 },
  group: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  footer: { fontSize: 12, lineHeight: 18, paddingHorizontal: 4 },
  row: { minHeight: 54, paddingHorizontal: space.md, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  label: { fontSize: 16 },
  detail: { fontSize: 14, lineHeight: 18 },
  rightRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  value: { fontSize: 14, flexShrink: 1, textAlign: 'right' },
  chevron: { fontSize: 22 },
  backdrop: { flex: 1, backgroundColor: '#000000AA' },
  sheet: { width: '100%', maxWidth: 560, alignSelf: 'center', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: space.lg, paddingBottom: space.xxl },
  sheetHead: { gap: 10, marginBottom: 10 },
  sheetScroll: { flexShrink: 1 },
  sheetBody: { gap: 10 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 6 },
  sheetTitle: { fontSize: 22, marginBottom: 2 },
  choice: { borderWidth: 1, borderRadius: 12, padding: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 54 },
  check: { fontSize: 22 },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  field: { gap: 6 },
  fieldHead: { flexDirection: 'row', justifyContent: 'space-between' },
  fieldLabel: { fontSize: 12, letterSpacing: 0.4 },
  inputWrap: { borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  prefix: { fontSize: 16, marginRight: 2 },
  input: { flex: 1, fontSize: 16, minHeight: 50, paddingVertical: 12 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  fieldNote: { fontSize: 12, lineHeight: 17 },
});
