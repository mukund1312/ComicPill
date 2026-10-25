import AsyncStorage from '@react-native-async-storage/async-storage';
import { createSettingsStore } from './settingsStore';
import { createProfileStore } from './profileStore';

/** App-wide settings, persisted on this device. */
export const useSettings = createSettingsStore(AsyncStorage);
/** The reader's own profile, persisted on this device. */
export const useProfile = createProfileStore(AsyncStorage);
