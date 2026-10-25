// The ONLY place expo-notifications is loaded. It is required lazily and
// guarded, because importing it in Expo Go on Android throws at load time and
// would take the whole app down with it. Everything else asks this module
// whether notifications exist before touching them.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { notificationsSupported } from './permissionsCore';

type NotificationsApi = typeof import('expo-notifications');

let cached: NotificationsApi | null | undefined;

export function getNotifications(): NotificationsApi | null {
  if (cached !== undefined) return cached;
  if (!notificationsSupported(Platform.OS, Constants.executionEnvironment)) { cached = null; return cached; }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-notifications') as NotificationsApi;
  } catch {
    cached = null;
  }
  return cached;
}

export const notificationsAvailable = () => getNotifications() !== null;
