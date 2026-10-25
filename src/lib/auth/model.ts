// Email accounts, kept on this device only. There is no ComicPill server, so
// this gates the app and names whose shelf it is; it does NOT sync between
// phones and cannot email a reset link. The password is stored salted+hashed in
// the phone's secure storage — enough to keep a casual hand out, not a bank vault.
export interface Account { email: string; salt: string; hash: string; createdAt: string }

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 128;
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 30_000;

export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

export function validateEmail(raw: string): string | null {
  const e = normalizeEmail(raw);
  if (!e) return 'Enter your email address.';
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return 'That doesn’t look like an email address.';
  return null;
}

export function validatePassword(pw: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (pw.length > MAX_PASSWORD) return `Keep it under ${MAX_PASSWORD} characters.`;
  return null;
}

export type Hasher = (salt: string, password: string) => Promise<string>;

/** Compare without bailing at the first difference. */
export function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createAccount(email: string, password: string, deps: { salt: () => string; hash: Hasher; now: Date }): Promise<Account> {
  const salt = deps.salt();
  return { email: normalizeEmail(email), salt, hash: await deps.hash(salt, password), createdAt: deps.now.toISOString() };
}

export async function passwordMatches(account: Account, email: string, password: string, hash: Hasher): Promise<boolean> {
  // Always do the hash work so a wrong email and a wrong password cost the same.
  const h = await hash(account.salt, password);
  return sameHash(h, account.hash) && normalizeEmail(email) === account.email;
}

/** Read an account back from storage; anything malformed is treated as no account. */
export function parseAccount(raw: string | null): Account | null {
  if (!raw) return null;
  try {
    const a = JSON.parse(raw) as Partial<Account>;
    if (typeof a.email === 'string' && typeof a.salt === 'string' && typeof a.hash === 'string' && a.salt && a.hash && !validateEmail(a.email)) {
      return { email: a.email, salt: a.salt, hash: a.hash, createdAt: typeof a.createdAt === 'string' ? a.createdAt : '' };
    }
  } catch { /* fall through */ }
  return null;
}
