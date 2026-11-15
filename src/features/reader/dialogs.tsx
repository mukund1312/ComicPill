import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSheetDrag } from '../../ui/sheetDrag';
import { feedback } from '../../lib/platform/feedback';
import { radius, space, type } from '../../ui/tokens';

import { useThemed, type Palette, type Fonts } from '../../ui/theme';

export type SheetOption = { label: string; onPress: () => void; destructive?: boolean; checked?: boolean };

/** Bottom action sheet (Android has no Alert with more than three buttons). */
export function ActionSheet({ visible, title, options, onClose }: { visible: boolean; title?: string; options: SheetOption[]; onClose: () => void }) {
  const { styles } = useThemed(makeStyles);
  const insets = useSafeAreaInsets();
  const drag = useSheetDrag(onClose);
  // Never taller than the screen (a phone on its side is short): the list scrolls instead, and dragging the handle still closes it.
  const maxHeight = useWindowDimensions().height - insets.top - space.md;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent supportedOrientations={['portrait', 'landscape']}>
      {/* A Modal is its own window, so it needs its own gesture root. Tap outside, or drag the sheet down, to close. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onClose}>
            <Animated.View style={[styles.sheet, { maxHeight, paddingBottom: insets.bottom + space.md }, drag.style]}>
              <Pressable onPress={() => undefined} style={styles.fill}>
                <GestureDetector gesture={drag.gesture}>
                  <View collapsable={false}>
                    <View style={styles.grab} />
                    {title ? <Text numberOfLines={1} style={styles.title}>{title}</Text> : null}
                  </View>
                </GestureDetector>
                <ScrollView style={styles.fill} bounces={false} showsVerticalScrollIndicator>
                  {options.map((o) => (
                    <Pressable key={o.label} accessibilityRole="button" style={styles.row} onPress={() => { feedback.select(); onClose(); setTimeout(o.onPress, 450); }}>
                      <Text style={[styles.rowText, o.destructive && styles.destructive]}>{o.label}</Text>
                      {o.checked ? <Text style={styles.check}>✓</Text> : null}
                    </Pressable>
                  ))}
                </ScrollView>
              </Pressable>
            </Animated.View>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}

export function PromptModal({ visible, title, initial = '', placeholder, submitLabel = 'Save', secure = false, onSubmit, onClose }: {
  visible: boolean; title: string; initial?: string; placeholder?: string; submitLabel?: string; secure?: boolean; onSubmit: (value: string) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* Mounted only while visible, so the field starts from `initial` every time. */}
      <PromptBody key={title} title={title} initial={initial} placeholder={placeholder} submitLabel={submitLabel} secure={secure} onSubmit={onSubmit} onClose={onClose} />
    </Modal>
  );
}

function PromptBody({ title, initial, placeholder, submitLabel, secure, onSubmit, onClose }: { title: string; initial: string; placeholder?: string; submitLabel: string; secure: boolean; onSubmit: (value: string) => void; onClose: () => void }) {
  const { color, styles } = useThemed(makeStyles);
  const [value, setValue] = useState(initial);
  const field = useRef<TextInput>(null);
  // autoFocus alone is unreliable inside an Android Modal: ask again once the dialog has settled.
  useEffect(() => { const t = setTimeout(() => field.current?.focus(), 250); return () => clearTimeout(t); }, []);
  const submit = () => { const v = value.trim(); if (v) { onClose(); onSubmit(v); } };
  return (
    <Pressable style={[styles.backdrop, styles.center]} onPress={onClose}>
      <Pressable style={styles.dialog} onPress={() => undefined}>
        <Text style={styles.title}>{title}</Text>
        <TextInput ref={field} autoFocus value={value} onChangeText={setValue} secureTextEntry={secure} autoCapitalize="none" autoCorrect={false} placeholder={placeholder} placeholderTextColor={color.faint} style={styles.input} onSubmitEditing={submit} returnKeyType="done" />
        <View style={styles.buttons}>
          <Pressable onPress={onClose} style={styles.button}><Text style={styles.buttonText}>Cancel</Text></Pressable>
          <Pressable onPress={submit} style={[styles.button, styles.primary]}><Text style={styles.primaryText}>{submitLabel}</Text></Pressable>
        </View>
      </Pressable>
    </Pressable>
  );
}

const makeStyles = (color: Palette, font: Fonts) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  center: { justifyContent: 'center', padding: space.xl },
  sheet: { width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: color.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: space.md, paddingHorizontal: space.lg },
  fill: { flexShrink: 1 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: color.border, marginBottom: space.sm },
  title: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.caption, marginBottom: space.sm },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: color.border },
  rowText: { color: color.text, fontFamily: font.bodyMedium, fontSize: type.body },
  destructive: { color: color.danger },
  check: { color: color.accent, fontSize: 20 },
  dialog: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, color: color.text, paddingHorizontal: space.md, fontFamily: font.body, fontSize: type.body },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
  button: { minHeight: 44, paddingHorizontal: space.lg, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.body },
  primary: { backgroundColor: color.accent },
  primaryText: { color: color.text, fontFamily: font.bodySemibold, fontSize: type.body },
});
