// The reader's own profile: what they typed, and the rules for accepting it.
export interface UserProfile {
  displayName: string;
  /** Lowercase handle, e.g. "pluto.reader". */
  username: string;
  bio: string;
  /** A small JPEG as a data: URI, or null to show initials. */
  avatar: string | null;
  /** Books the reader wants to finish each month. */
  monthlyGoal: number;
}

export const DEFAULT_PROFILE: UserProfile = {
  displayName: 'Pluto',
  username: 'pluto.reader',
  bio: 'Comic explorer, mood reader, forever collector.',
  avatar: null,
  monthlyGoal: 4,
};

export const LIMITS = { displayName: 30, usernameMin: 3, usernameMax: 20, bio: 140, goalMin: 1, goalMax: 30 } as const;

export type ProfileErrors = Partial<Record<'displayName' | 'username' | 'bio' | 'monthlyGoal', string>>;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Normalizes and validates user input. `value` is always usable; `ok` says
 *  whether it may be saved. */
export function validateProfile(input: UserProfile): { ok: boolean; errors: ProfileErrors; value: UserProfile } {
  const errors: ProfileErrors = {};
  const displayName = clean(input.displayName);
  const username = input.username.trim().toLowerCase();
  const bio = input.bio.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  if (!displayName) errors.displayName = 'Add a name.';
  else if (displayName.length > LIMITS.displayName) errors.displayName = `Keep it under ${LIMITS.displayName} characters.`;

  if (!/^[a-z0-9._]+$/.test(username)) errors.username = 'Use letters, numbers, dots and underscores.';
  else if (username.length < LIMITS.usernameMin || username.length > LIMITS.usernameMax) errors.username = `Use ${LIMITS.usernameMin}–${LIMITS.usernameMax} characters.`;
  else if (/^[._]|[._]$|\.\./.test(username)) errors.username = 'No leading, trailing or doubled dots.';

  if (bio.length > LIMITS.bio) errors.bio = `Keep it under ${LIMITS.bio} characters.`;

  const goal = Math.round(input.monthlyGoal);
  if (!Number.isFinite(goal) || goal < LIMITS.goalMin || goal > LIMITS.goalMax) errors.monthlyGoal = `Choose ${LIMITS.goalMin}–${LIMITS.goalMax} books.`;

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { displayName, username, bio, avatar: input.avatar, monthlyGoal: Number.isFinite(goal) ? goal : DEFAULT_PROFILE.monthlyGoal },
  };
}

const MAX_AVATAR_CHARS = 400_000; // ~300 KB of base64: plenty for a 256px JPEG

/** Read a stored profile back: keep what's valid, default the rest. */
export function sanitizeProfile(raw: unknown): UserProfile {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
  const merged: UserProfile = {
    displayName: str(r.displayName, DEFAULT_PROFILE.displayName),
    username: str(r.username, DEFAULT_PROFILE.username),
    bio: str(r.bio, DEFAULT_PROFILE.bio),
    avatar: typeof r.avatar === 'string' && r.avatar.startsWith('data:image/') && r.avatar.length <= MAX_AVATAR_CHARS ? r.avatar : null,
    monthlyGoal: typeof r.monthlyGoal === 'number' ? r.monthlyGoal : DEFAULT_PROFILE.monthlyGoal,
  };
  const v = validateProfile(merged);
  // A single bad field shouldn't discard the rest: fall back per field.
  return {
    displayName: v.errors.displayName ? DEFAULT_PROFILE.displayName : v.value.displayName,
    username: v.errors.username ? DEFAULT_PROFILE.username : v.value.username,
    bio: v.errors.bio ? DEFAULT_PROFILE.bio : v.value.bio,
    avatar: merged.avatar,
    monthlyGoal: v.errors.monthlyGoal ? DEFAULT_PROFILE.monthlyGoal : v.value.monthlyGoal,
  };
}

export const initialOf = (p: Pick<UserProfile, 'displayName' | 'username'>) =>
  (p.displayName.trim() || p.username.trim() || '?').charAt(0).toUpperCase();

export const sameProfile = (a: UserProfile, b: UserProfile) =>
  a.displayName === b.displayName && a.username === b.username && a.bio === b.bio && a.avatar === b.avatar && a.monthlyGoal === b.monthlyGoal;
