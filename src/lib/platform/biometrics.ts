// Fingerprint / face unlock for the things ComicPill locks (comics, folders, the hidden shelf). It only ever stands in for typing the
// password: the password is still checked the usual way when the reader types it, and works whatever the fingerprint says.
import { Alert } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useSettings } from '../state/settings';

/** Fingerprint (or face) hardware is present and something is enrolled. */
export async function biometricsAvailable(): Promise<boolean> {
  try { return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync()); } catch { return false; }
}

/** Available, and the reader hasn't turned it off in Settings. */
export async function biometricsOn(): Promise<boolean> {
  return useSettings.getState().biometricUnlock && biometricsAvailable();
}

/** What the phone calls it, for buttons: "fingerprint" on most Android phones, "Face ID" on iPhones with one. */
export async function biometricName(): Promise<string> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint';
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
  } catch { /* fall through */ }
  return 'fingerprint';
}

/**
 * Asks for the fingerprint. True only when it matched. The phone's own PIN is not offered as a fallback: "Use password" closes the prompt
 * and ComicPill asks for its own password instead, so someone who knows the phone's PIN can't open a locked comic with it.
 */
export async function confirmWithBiometrics(what: string): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: `Open ${what}`, cancelLabel: 'Use password', disableDeviceFallback: true, fallbackLabel: '' });
    return r.success;
  } catch { return false; }
}

/**
 * Asked when a lock is made: open it with a fingerprint too, or only with the password? Phones without a fingerprint set up skip the
 * question (password only). Answers true for "fingerprint too".
 */
export async function askToUseBiometrics(what: string): Promise<boolean> {
  if (!(await biometricsAvailable())) return false;
  const name = await biometricName();
  return new Promise((resolve) => {
    Alert.alert(`Open ${what} with your ${name}?`, `You can open it with your ${name} or the password. Choose “Password only” if others have their ${name} on this phone.`, [
      { text: 'Password only', onPress: () => resolve(false) },
      { text: `Use ${name}`, onPress: () => resolve(true) },
    ], { cancelable: false });
  });
}
