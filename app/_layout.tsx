// Root layout — minimal on purpose. This wires the app's boot sequence
// (fonts, gesture root, local db init) but leaves screen composition to the
// frontend build (see /docs for the design blueprint and API surface).
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View, ActivityIndicator, Dimensions } from 'react-native';
import {
  useFonts,
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { Ionicons } from '@expo/vector-icons';
import {
  PlayfairDisplay_600SemiBold, PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed';
import { initDatabase } from '../src/lib/db/client';
import { clearTemporaryFiles } from '../src/lib/reader/storage';
import { purgeExpiredDrafts } from '../src/lib/scan/draft';
import { backfillReaderLinks } from '../src/lib/reader/libraryLink';
import { registerGeneratedArcTemplates } from '../src/lib/db/queries/generatedArcs';
import { loadFileCovers } from '../src/ui/fileCovers';
import { installCrashLog } from '../src/lib/diagnostics/crashLog';
import { color } from '../src/ui/tokens';
import { AppearanceProvider, useAppearance } from '../src/ui/theme';
import ReminderSync from '../src/features/settings/ReminderSync';
import MindSync from '../src/features/mind/MindSync';
import { AppLockGate } from '../src/ui/AppLockGate';
import { BootSplash } from '../src/ui/BootSplash';
import * as SplashScreen from 'expo-splash-screen';

// Keep the native splash up until our own opening animation is on screen.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);
import '../src/lib/mind/task';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold,
    ...Ionicons.font,
    PlayfairDisplay_600SemiBold, PlayfairDisplay_700Bold,
    BarlowCondensed_600SemiBold, BarlowCondensed_700Bold,
  });
  const [dbReady] = useState(() => {
    initDatabase();
    try { backfillReaderLinks(); } catch { /* the reader works without library links */ }
    loadFileCovers();
    try { clearTemporaryFiles(); } catch { /* leftovers are harmless; the Storage screen can clear them */ }
    try { purgeExpiredDrafts(); } catch { /* an old scan lingering is harmless */ }
    try { registerGeneratedArcTemplates(); } catch { /* the hand-written journeys still work */ }
    installCrashLog();
    return true;
  });

  // The app is portrait-only; app.json allows rotation so the reader can unlock it for two-page landscape.
  // Phones stay portrait (the reader unlocks it for two-page landscape); tablets rotate freely.
  useEffect(() => {
    const { width, height } = Dimensions.get('window');
    const tablet = Math.min(width, height) >= 600;
    (tablet ? ScreenOrientation.unlockAsync() : ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)).catch(() => undefined);
  }, []);

  if (!fontsLoaded || !dbReady) return null; // the native splash is still showing

  return <GestureHandlerRootView style={{ flex: 1 }}><AppearanceProvider><ReminderSync /><MindSync /><ThemedStack /><AppLockGate /><BootSplash /></AppearanceProvider></GestureHandlerRootView>;
}

function ThemedStack() {
  const { theme, ready } = useAppearance();
  if (!ready) return <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={color.accent} /></View>;
  const background = theme.colors.background;
  const value = Number.parseInt(background.slice(1), 16);
  const brightness = ((value >> 16) & 255) * 0.299 + ((value >> 8) & 255) * 0.587 + (value & 255) * 0.114;
  return <><StatusBar style={brightness > 150 ? 'dark' : 'light'} animated /><Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: background } }}>
      {/* The five bottom tabs replace each other, so they cross-fade instead of sliding like a new page. */}
      {['index', 'library', 'reader/index', 'discover', 'search'].map((name) => <Stack.Screen key={name} name={name} options={{ animation: 'fade' }} />)}
      <Stack.Screen name="reader/[id]" options={{ animation: 'fade' }} />
    </Stack></>;
}
