import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSheetDrag } from '../../ui/sheetDrag';
import { optionalNative } from '../../lib/reader/nativeArchive';
import { radius, space, type } from '../../ui/tokens';

import { useThemed, type Palette, type Fonts } from '../../ui/theme';

export type PageText = { loading: boolean; text: string | null; unavailable?: boolean } | null;

/** Translate on the device where the system can (Apple Translation), otherwise open Google Translate in the browser. */
export async function translate(text: string): Promise<void> {
  try { if (await optionalNative()?.translateText?.(text.slice(0, 4000))) return; } catch { /* fall through to the browser */ }
  void Linking.openURL(translateUrl(text));
}

export const translateUrl = (text: string) => `https://translate.google.com/?sl=auto&tl=en&op=translate&text=${encodeURIComponent(text.slice(0, 4000))}`;

/** Text read off the page on this phone, ready to copy, translate or share. */
export function PageTextSheet({ value, onClose }: { value: PageText; onClose: () => void }) {
  const { color, styles } = useThemed(makeStyles);
  const insets = useSafeAreaInsets();
  const drag = useSheetDrag(onClose);
  const text = value?.text?.trim() ?? '';
  return (
    <Modal visible={!!value} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
<Pressable style={styles.backdrop} onPress={onClose}>
<GestureDetector gesture={drag.gesture}>
<Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }, drag.style]}>
          <View style={styles.handle} />
          <Text style={styles.heading}>Text on this page</Text>
          {value?.loading ? <ActivityIndicator color={color.accent} style={{ marginVertical: space.xl }} /> : value?.unavailable ? (
            <Text style={styles.note}>This build can’t read text from pages. Install the full ComicPill app (not Expo Go) to use the device’s own text recognition.</Text>
          ) : !text ? <Text style={styles.note}>No text found on this page.</Text> : (
            <>
              <ScrollView style={styles.box}><Text selectable style={styles.text}>{text}</Text></ScrollView>
              <View style={styles.row}>
                <Pressable accessibilityRole="button" style={[styles.btn, styles.primary]} onPress={() => { void Clipboard.setStringAsync(text); }}><Text style={styles.primaryText}>Copy</Text></Pressable>
                <Pressable accessibilityRole="button" style={styles.btn} onPress={() => { void translate(text); }}><Text style={styles.btnText}>Translate</Text></Pressable>
                <Pressable accessibilityRole="button" style={styles.btn} onPress={() => { void Share.share({ message: text }); }}><Text style={styles.btnText}>Share</Text></Pressable>
              </View>
              <Text style={styles.note}>{optionalNative()?.translateText ? 'Translate uses the translation built into this device. Language packs download once, then it works offline.' : 'Translate opens Google Translate with this text. It is only sent if you tap it.'}</Text>
            </>
          )}
        </Animated.View>
</GestureDetector>
      </Pressable>
</GestureHandlerRootView>
    </Modal>
  );
}

const makeStyles = (color: Palette, font: Fonts) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' },
  sheet: { width: '100%', maxWidth: 560, alignSelf: 'center', maxHeight: '75%', backgroundColor: color.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, gap: space.md },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: color.border },
  heading: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle },
  box: { maxHeight: 280, backgroundColor: color.surface2, borderRadius: radius.md, padding: space.md },
  text: { color: color.text, fontFamily: font.body, fontSize: type.body, lineHeight: 24 },
  row: { flexDirection: 'row', gap: space.sm },
  btn: { flex: 1, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: color.text, fontFamily: font.bodyMedium, fontSize: type.caption },
  primary: { backgroundColor: color.accent, borderColor: color.accent },
  primaryText: { color: color.text, fontFamily: font.bodySemibold, fontSize: type.caption },
  note: { color: color.muted, fontFamily: font.body, fontSize: 12, lineHeight: 17 },
});
