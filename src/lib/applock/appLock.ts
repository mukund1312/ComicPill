// An optional passcode for the whole app: asked for when ComicPill opens, and again after it has been away for a while.
// Like the per-comic locks it is a privacy curtain, not encryption — the salted hash lives in the phone's secure store.
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { checkPassword, makeLock, type Lock } from '../reader/lock';
import { newSalt, sha256 } from '../reader/lockCrypto';

const KEY = 'comicpill.applock.v1';
// iOS keeps keychain items after the app is deleted, but app storage is wiped. This marker lives in app storage: a passcode without it is a
// leftover from an earlier install and is discarded, so a reinstall never opens on a lock nobody can remember setting.
const MARKER = 'comicpill.applock.marker';
const AWAY_MS = 30_000; // coming back within this long doesn't ask again

type State = { ready: boolean; lock: Lock | null; locked: boolean; setLock: (password: string) => Promise<void>; clearLock: () => Promise<void>; unlock: (password: string) => Promise<boolean>; verify: (password: string) => Promise<boolean> };

export const useAppLock = create<State>((set, get) => ({
  ready: false, lock: null, locked: false,
  setLock: async (password) => {
    const lock = await makeLock(password, sha256, newSalt());
    await SecureStore.setItemAsync(KEY, JSON.stringify(lock));
    await AsyncStorage.setItem(MARKER, '1');
    set({ lock, locked: false });
  },
  clearLock: async () => { await SecureStore.deleteItemAsync(KEY); await AsyncStorage.removeItem(MARKER).catch(() => undefined); set({ lock: null, locked: false }); },
  verify: async (password) => { const { lock } = get(); return !!lock && (await checkPassword(password, lock, sha256)); },
  unlock: async (password) => { const ok = await get().verify(password); if (ok) set({ locked: false }); return ok; },
}));

let started = false;
/** Read the saved passcode (locking straight away if there is one) and start watching for the app leaving the foreground. */
export function startAppLock(): void {
  if (started) return;
  started = true;
  void (async () => {
    try {
      let raw = await SecureStore.getItemAsync(KEY);
      if (raw && !(await AsyncStorage.getItem(MARKER))) { await SecureStore.deleteItemAsync(KEY).catch(() => undefined); raw = null; }
      const lock = raw ? (JSON.parse(raw) as Lock) : null;
      useAppLock.setState({ lock, locked: !!lock, ready: true });
    } catch { useAppLock.setState({ ready: true }); }
  })();
  let leftAt = 0;
  AppState.addEventListener('change', (next) => {
    if (next === 'background') leftAt = Date.now();
    else if (next === 'active' && leftAt && Date.now() - leftAt > AWAY_MS && useAppLock.getState().lock) useAppLock.setState({ locked: true });
  });
}
