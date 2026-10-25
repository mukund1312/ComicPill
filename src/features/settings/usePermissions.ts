// Live permission status for the Settings screens. Refreshes whenever the
// screen is focused AND whenever the app returns to the foreground, because
// the reader may have just flipped a switch in the system Settings app.
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getAllPermissions, getPermission, openSystemSettings, requestPermission } from '../../lib/platform/permissions';
import { actionFor, NOTIFICATIONS_UNAVAILABLE_MESSAGE, PERMISSION_COPY, type PermissionKey, type PermissionState } from '../../lib/platform/permissionsCore';
import { confirm, notice } from '../../ui/dialogs';

export function usePermissions() {
  const [states, setStates] = useState<Record<PermissionKey, PermissionState> | null>(null);
  const refresh = useCallback(() => { void getAllPermissions().then(setStates); }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => sub.remove();
  }, [refresh]);

  const sendToSettings = useCallback(async (key: PermissionKey, why: string) => {
    if (await confirm({ title: `${PERMISSION_COPY[key].title} is turned off`, message: `${why} You can change this in your phone’s Settings.`, confirmLabel: 'Open Settings' })) {
      await openSystemSettings();
    }
  }, []);

  /** Tap on a permission row: ask if the OS will let us, otherwise go to Settings. */
  const activate = useCallback(async (key: PermissionKey): Promise<PermissionState> => {
    const current = await getPermission(key);
    if (current === 'unavailable') { notice('Not available in this build', NOTIFICATIONS_UNAVAILABLE_MESSAGE); return current; }
    const action = actionFor(current);
    let result: PermissionState = current;
    if (action === 'request') {
      result = await requestPermission(key);
      if (result !== 'granted') await sendToSettings(key, 'It wasn’t allowed, so this can’t work yet.').catch(() => undefined);
    } else if (action === 'open_settings') {
      await sendToSettings(key, PERMISSION_COPY[key].why);
    } else {
      await openSystemSettings(); // already allowed: managing/revoking happens in system Settings
    }
    refresh();
    return result;
  }, [refresh, sendToSettings]);

  /** Ask for a permission a feature needs right now. Returns whether it is granted. */
  const ensure = useCallback(async (key: PermissionKey): Promise<boolean> => {
    let state: PermissionState = await getPermission(key);
    if (state === 'unavailable') { notice('Not available in this build', NOTIFICATIONS_UNAVAILABLE_MESSAGE); return false; }
    if (state === 'not_asked' || state === 'denied') state = await requestPermission(key);
    if (state !== 'granted') await sendToSettings(key, PERMISSION_COPY[key].why);
    refresh();
    return state === 'granted';
  }, [refresh, sendToSettings]);

  return { states, activate, ensure, refresh };
}
