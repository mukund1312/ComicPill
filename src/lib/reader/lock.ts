// A privacy lock for comics and folders: a password the reader sets, checked before the comic or folder opens.
// What this is: a way to keep a casual look-over-the-shoulder, or a friend borrowing the phone, out of certain titles.
// What it is not: encryption. The files themselves are not scrambled on disk.
export type Lock = { hash: string; salt: string };
export type Sha256 = (text: string) => Promise<string>;

export const MIN_PASSWORD = 4;

const digest = (sha256: Sha256, salt: string, password: string) => sha256(`${salt}:${password}`);

/** Salt + hash of a new password. The password itself is never stored. */
export async function makeLock(password: string, sha256: Sha256, salt: string): Promise<Lock> {
  return { salt, hash: await digest(sha256, salt, password) };
}

export async function checkPassword(password: string, lock: Lock, sha256: Sha256): Promise<boolean> {
  const attempt = await digest(sha256, lock.salt, password);
  // Compare every character so a wrong guess takes the same time however close it is.
  if (attempt.length !== lock.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < attempt.length; i++) diff |= attempt.charCodeAt(i) ^ lock.hash.charCodeAt(i);
  return diff === 0;
}

export function passwordProblem(password: string): string | null {
  return password.length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters.` : null;
}

/** Items the reader has opened this session. Cleared whenever the app leaves the foreground. */
const unlocked = new Set<string>();
export const unlockKey = (kind: 'comic' | 'folder', id: string) => `${kind}:${id}`;
export const markUnlocked = (kind: 'comic' | 'folder', id: string) => { unlocked.add(unlockKey(kind, id)); };
export const isUnlocked = (kind: 'comic' | 'folder', id: string) => unlocked.has(unlockKey(kind, id));
export const relockAll = () => { unlocked.clear(); };

/** Comics stay out of searches and "Reading now" while the folder they sit in is locked. */
export function isHiddenByFolder<T extends { folderId: string | null }>(comic: T, lockedFolders: Set<string>, openFolders: Set<string>): boolean {
  return !!comic.folderId && lockedFolders.has(comic.folderId) && !openFolders.has(comic.folderId);
}
