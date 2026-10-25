// Root layout — minimal on purpose. This wires the app's boot sequence
// (fonts, gesture root, local db init) but leaves screen composition to the
// frontend build (see /docs for the design blueprint and API surface).
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View, ActivityIndicator } from 'react-native';
import {
  useFonts,
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import {
  PlayfairDisplay_600SemiBold, PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed';
import { initDatabase } from '../src/lib/db/client';
import { installCrashLog } from '../src/lib/diagnostics/crashLog';
import { color } from '../src/ui/tokens';
import { AppearanceProvider, useAppearance } from '../src/ui/theme';
import ReminderSync from '../src/features/settings/ReminderSync';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold,
    PlayfairDisplay_600SemiBold, PlayfairDisplay_700Bold,
    BarlowCondensed_600SemiBold, BarlowCondensed_700Bold,
  });
  const [dbReady] = useState(() => {
    initDatabase();
    installCrashLog();
    return true;
  });

  // The app is portrait-only; app.json allows rotation so the reader can unlock it for two-page landscape.
  useEffect(() => { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined); }, []);

  if (!fontsLoaded || !dbReady) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={color.accent} />
      </View>
    );
  }

  return <GestureHandlerRootView style={{ flex: 1 }}><AppearanceProvider><ReminderSync /><ThemedStack /></AppearanceProvider></GestureHandlerRootView>;
}

function ThemedStack() {
  const { theme, ready } = useAppearance();
  if (!ready) return <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={color.accent} /></View>;
  const background = theme.colors.background;
  const value = Number.parseInt(background.slice(1), 16);
  const brightness = ((value >> 16) & 255) * 0.299 + ((value >> 8) & 255) * 0.587 + (value & 255) * 0.114;
  return <><StatusBar style={brightness > 150 ? 'dark' : 'light'} animated /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: background } }} /></>;
}
