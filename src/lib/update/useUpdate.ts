import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useSettings } from '../state/settings';
import { checkForUpdate, dismissVersion, isDismissed } from './check';
import { isTrustedApkUrl, type UpdateStatus } from './manifest';

/** The check only makes sense for a directly-installed Android APK. A Play
 *  Store build turns it off with EXPO_PUBLIC_DISABLE_UPDATE_CHECK=1 (set in
 *  the production EAS profile), because the Play Store updates the app itself. */
export const updatesSupported = () => Platform.OS === 'android' && process.env.EXPO_PUBLIC_DISABLE_UPDATE_CHECK !== '1';

export const installedVersion = () => Constants.expoConfig?.version ?? '0.0.0';

export function useUpdate() {
  const enabled = useSettings((s) => s.checkForUpdates) && updatesSupported();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);

  /** Ask the server and work out what to show. Touches no React state, so it is safe to call from an effect. */
  const evaluate = useCallback(async (force: boolean): Promise<{ result: UpdateStatus | null; shown: UpdateStatus | null }> => {
    const result = await checkForUpdate(installedVersion(), { storage: AsyncStorage, force });
    // "Required" is never dismissible; an "available" one the reader already waved off stays hidden.
    const hidden = result?.kind === 'available' && !force && await isDismissed(result.latest, AsyncStorage);
    return { result, shown: hidden ? { kind: 'up_to_date' } : result };
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    void evaluate(false).then(({ shown }) => { if (alive) setStatus(shown); });
    return () => { alive = false; };
  }, [enabled, evaluate]);

  const checkNow = useCallback(async (): Promise<UpdateStatus | null> => {
    setChecking(true);
    try {
      const { result, shown } = await evaluate(true);
      setStatus(shown);
      return result;
    } finally {
      setChecking(false);
    }
  }, [evaluate]);

  const dismiss = useCallback(async () => {
    if (status?.kind === 'available') { await dismissVersion(status.latest, AsyncStorage); setStatus({ kind: 'up_to_date' }); }
  }, [status]);

  const openDownload = useCallback(async () => {
    if (status && status.kind !== 'up_to_date' && isTrustedApkUrl(status.apkUrl)) await Linking.openURL(status.apkUrl);
  }, [status]);

  return { status, checking, supported: updatesSupported(), checkNow, dismiss, openDownload };
}
