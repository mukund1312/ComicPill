// Turns the raw answers different OS permission APIs give into one small
// vocabulary the UI can act on. Pure — the native calls live in permissions.ts.
export type PermissionKey = 'camera' | 'photos' | 'notifications';
/** 'unavailable' = this build of the app cannot do it at all (e.g. notifications in Expo Go on Android). */
export type PermissionState = 'granted' | 'not_asked' | 'denied' | 'blocked' | 'unavailable';

export interface RawPermission {
  granted: boolean;
  /** true when the OS has never been asked (iOS "not determined"). */
  undetermined: boolean;
  canAskAgain: boolean;
}

/** granted -> use it. Never asked -> ask. Denied but askable (Android) -> ask
 *  again. Denied and not askable -> only the system Settings can change it. */
export function toPermissionState(raw: RawPermission | null): PermissionState {
  if (!raw) return 'not_asked';
  if (raw.granted) return 'granted';
  if (raw.undetermined) return 'not_asked';
  return raw.canAskAgain ? 'denied' : 'blocked';
}

export type PermissionAction = 'request' | 'open_settings' | 'none';

export function actionFor(state: PermissionState): PermissionAction {
  switch (state) {
    case 'not_asked':
    case 'denied': return 'request';
    case 'blocked': return 'open_settings';
    case 'granted':
    case 'unavailable': return 'none';
  }
}

export const PERMISSION_COPY: Record<PermissionKey, { title: string; why: string }> = {
  camera: { title: 'Camera', why: 'For photographing your comic shelf to scan it, and for a profile photo.' },
  photos: { title: 'Photos', why: 'Not needed: pictures you choose go through your phone’s own picker.' },
  notifications: { title: 'Notifications', why: 'Needed for your daily reading reminder.' },
};

export const STATE_LABEL: Record<PermissionState, string> = {
  granted: 'Allowed', not_asked: 'Not asked yet', denied: 'Not allowed', blocked: 'Blocked in system settings', unavailable: 'Not available here',
};

/** expo-notifications throws on import inside Expo Go on Android (since SDK 53),
 *  and Expo Go reports its environment as 'storeClient'. Everywhere else —
 *  a development build, a production build, iOS — it loads fine. */
export function notificationsSupported(platform: string, executionEnvironment: string | null | undefined): boolean {
  return !(platform === 'android' && executionEnvironment === 'storeClient');
}

export const NOTIFICATIONS_UNAVAILABLE_MESSAGE =
  'Reminders need a development build of ComicPill. Expo Go on Android can\u2019t send notifications. Run "npx expo run:android" to install one.';
