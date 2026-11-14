// The hidden shelf: a second shelf inside "On my phone" that only opens with its own password. Comics on it are left out of the normal shelf,
// folders, Reading now, search and the catalog, so nothing on the rest of the app points at them.
// Like the other locks it is a privacy curtain, not encryption: the files themselves are not scrambled on disk.
import { getMeta, setMeta } from '../db/queries/meta';
import { checkPassword, makeLock, type Lock } from './lock';
import { newPasswordProblem } from './hiddenShelfCore';
import { newSalt, sha256 } from './lockCrypto';
import { unlinkReaderComic } from './libraryLink';
import { countHiddenComics, listHiddenComics, setComicsHidden } from './readerLibrary';
import { removeComics } from './importComics';

const LOCK_KEY = 'hidden_shelf_lock';
/** Set once the reader has answered the "set up a hidden shelf?" question, either way, so it isn't asked again. */
const ASKED_KEY = 'hidden_shelf_asked';

const readLock = (): Lock | null => {
  try {
    const raw = getMeta(LOCK_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<Lock>) : null;
    return v?.hash && v.salt ? { hash: v.hash, salt: v.salt } : null;
  } catch { return null; }
};

export const hiddenShelfReady = (): boolean => readLock() !== null;
export const hiddenShelfAsked = (): boolean => getMeta(ASKED_KEY) === '1';
export const markHiddenShelfAsked = (): void => setMeta(ASKED_KEY, '1');

export async function setUpHiddenShelf(password: string): Promise<void> {
  setMeta(LOCK_KEY, JSON.stringify(await makeLock(password, sha256, newSalt())));
  markHiddenShelfAsked();
}

export async function checkHiddenShelfPassword(password: string): Promise<boolean> {
  const lock = readLock();
  return !!lock && (await checkPassword(password, lock, sha256));
}

/** Replaces the password. False (and nothing changed) when the current one is wrong. */
export async function changeHiddenShelfPassword(current: string, next: string): Promise<boolean> {
  if (!(await checkHiddenShelfPassword(current))) return false;
  setMeta(LOCK_KEY, JSON.stringify(await makeLock(next, sha256, newSalt())));
  return true;
}

/** Moves comics onto the hidden shelf. They leave their folders and the catalog (a catalog entry made only for the file goes too). */
export function hideComics(ids: string[]): void {
  for (const id of ids) { try { unlinkReaderComic(id); } catch { /* the catalog entry is cosmetic; hiding the file matters */ } }
  setComicsHidden(ids, true);
}

/** Back onto the normal shelf, at the top level. */
export const unhideComics = (ids: string[]): void => setComicsHidden(ids, false);

/** Turns the hidden shelf off: every hidden comic goes back to the normal shelf and the password is forgotten. False if the password is wrong. */
export async function turnOffHiddenShelf(password: string): Promise<boolean> {
  if (!(await checkHiddenShelfPassword(password))) return false;
  unhideComics(listHiddenComics().map((c) => c.id));
  setMeta(LOCK_KEY, '');
  return true;
}

/** Forgotten password: the only way back in is to start over, so the hidden comics are deleted from the device first. Returns how many went. */
export function resetHiddenShelf(): number {
  const ids = listHiddenComics().map((c) => c.id);
  removeComics(ids);
  setMeta(LOCK_KEY, '');
  return ids.length;
}

export { countHiddenComics, listHiddenComics };

export { newPasswordProblem, offsetFor, settleAfterSwipe, type PanelStop } from './hiddenShelfCore';
