// The native side of permissions: ask the OS, then hand the answer to the
// pure normalizer in permissionsCore. One place, so every screen agrees.
import { Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getNotifications } from './notificationsModule';
import { toPermissionState, type PermissionKey, type PermissionState, type RawPermission } from './permissionsCore';

const fromPicker = (r: ImagePicker.PermissionResponse): RawPermission => ({
  granted: r.granted,
  undetermined: r.status === ImagePicker.PermissionStatus.UNDETERMINED,
  canAskAgain: r.canAskAgain,
});

type NotifStatus = Awaited<ReturnType<typeof import('expo-notifications').getPermissionsAsync>>;

const fromNotifications = (N: NonNullable<ReturnType<typeof getNotifications>>, r: NotifStatus): RawPermission => ({
  granted: r.granted,
  // On iOS the root `status` is not reliable; the docs say to read ios.status.
  undetermined: r.ios ? r.ios.status === N.IosAuthorizationStatus.NOT_DETERMINED : r.status === N.PermissionStatus.UNDETERMINED,
  canAskAgain: r.canAskAgain,
});

export async function getPermission(key: PermissionKey): Promise<PermissionState> {
  try {
    switch (key) {
      case 'camera': return toPermissionState(fromPicker(await ImagePicker.getCameraPermissionsAsync()));
      case 'photos': return toPermissionState(fromPicker(await ImagePicker.getMediaLibraryPermissionsAsync()));
      case 'notifications': {
        const N = getNotifications();
        return N ? toPermissionState(fromNotifications(N, await N.getPermissionsAsync())) : 'unavailable';
      }
    }
  } catch {
    return 'not_asked';
  }
}

/** Show the OS prompt (if the OS still allows one) and return the new state. */
export async function requestPermission(key: PermissionKey): Promise<PermissionState> {
  try {
    switch (key) {
      case 'camera': return toPermissionState(fromPicker(await ImagePicker.requestCameraPermissionsAsync()));
      case 'photos': return toPermissionState(fromPicker(await ImagePicker.requestMediaLibraryPermissionsAsync()));
      case 'notifications': {
        const N = getNotifications();
        return N ? toPermissionState(fromNotifications(N, await N.requestPermissionsAsync())) : 'unavailable';
      }
    }
  } catch {
    return getPermission(key);
  }
}

export async function getAllPermissions(): Promise<Record<PermissionKey, PermissionState>> {
  const [camera, photos, notifications] = await Promise.all([getPermission('camera'), getPermission('photos'), getPermission('notifications')]);
  return { camera, photos, notifications };
}

/** Deep-link to this app's page in the system Settings. */
export function openSystemSettings(): Promise<void> {
  return Linking.openSettings().catch(() => undefined);
}
