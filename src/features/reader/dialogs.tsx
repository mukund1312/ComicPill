import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, font, radius, space, type } from '../../ui/tokens';

export type SheetOption = { label: string; onPress: () => void; destructive?: boolean; checked?: boolean };

/** Bottom action sheet (Android has no Alert with more than three buttons). */
export function ActionSheet({ visible, title, options, onClose }: { visible: boolean; title?: string; options: SheetOption[]; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]} onPress={() => undefined}>
          {title ? <Text numberOfLines={1} style={styles.title}>{title}</Text> : null}
          {options.map((o) => (
            <Pressable key={o.label} accessibilityRole="button" style={styles.row} onPress={() => { onClose(); o.onPress(); }}>
              <Text style={[styles.rowText, o.destructive && styles.destructive]}>{o.label}</Text>
              {o.checked ? <Text style={styles.check}>✓</Text> : null}
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
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
  const [value, setValue] = useState(initial);
  const submit = () => { const v = value.trim(); if (v) { onClose(); onSubmit(v); } };
  return (
    <Pressable style={[styles.backdrop, styles.center]} onPress={onClose}>
      <Pressable style={styles.dialog} onPress={() => undefined}>
        <Text style={styles.title}>{title}</Text>
        <TextInput autoFocus value={value} onChangeText={setValue} secureTextEntry={secure} autoCapitalize="none" autoCorrect={false} placeholder={placeholder} placeholderTextColor={color.faint} style={styles.input} onSubmitEditing={submit} returnKeyType="done" />
        <View style={styles.buttons}>
          <Pressable onPress={onClose} style={styles.button}><Text style={styles.buttonText}>Cancel</Text></Pressable>
          <Pressable onPress={submit} style={[styles.button, styles.primary]}><Text style={styles.primaryText}>{submitLabel}</Text></Pressable>
        </View>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  center: { justifyContent: 'center', padding: space.xl },
  sheet: { backgroundColor: color.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: space.md, paddingHorizontal: space.lg },
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
