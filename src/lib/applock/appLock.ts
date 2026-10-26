// An optional passcode for the whole app: asked for when ComicPill opens, and again after it has been away for a while.
// Like the per-comic locks it is a privacy curtain, not encryption — the salted hash lives in the phone's secure store.
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { checkPassword, makeLock, type Lock } from '../reader/lock';
import { newSalt, sha256 } from '../reader/lockCrypto';

const KEY = 'comicpill.applock.v1';
const AWAY_MS = 30_000; // coming back within this long doesn't ask again

type State = { ready: boolean; lock: Lock | null; locked: boolean; setLock: (password: string) => Promise<void>; clearLock: () => Promise<void>; unlock: (password: string) => Promise<boolean>; verify: (password: string) => Promise<boolean> };

export const useAppLock = create<State>((set, get) => ({
  ready: false, lock: null, locked: false,
  setLock: async (password) => {
    const lock = await makeLock(password, sha256, newSalt());
    await SecureStore.setItemAsync(KEY, JSON.stringify(lock));
    set({ lock, locked: false });
  },
  clearLock: async () => { await SecureStore.deleteItemAsync(KEY); set({ lock: null, locked: false }); },
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
      const raw = await SecureStore.getItemAsync(KEY);
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
