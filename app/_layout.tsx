// Root layout — minimal on purpose. This wires the app's boot sequence
// (fonts, gesture root, local db init) but leaves screen composition to the
// frontend build (see /docs for the design blueprint and API surface).
import { useState } from 'react';
import { Stack } from 'expo-router';
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
import { color } from '../src/ui/tokens';
import { AppearanceProvider, useAppearance } from '../src/ui/theme';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold,
    PlayfairDisplay_600SemiBold, PlayfairDisplay_700Bold,
    BarlowCondensed_600SemiBold, BarlowCondensed_700Bold,
  });
  const [dbReady] = useState(() => {
    initDatabase();
    return true;
  });

  if (!fontsLoaded || !dbReady) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={color.accent} />
      </View>
    );
  }

  return <GestureHandlerRootView style={{ flex: 1 }}><AppearanceProvider><ThemedStack /></AppearanceProvider></GestureHandlerRootView>;
}

function ThemedStack() {
  const { theme, ready } = useAppearance();
  if (!ready) return <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={color.accent} /></View>;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }} />;
}
