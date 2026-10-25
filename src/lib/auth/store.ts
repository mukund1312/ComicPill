// The sign-in state: who (if anyone) is signed in on this device. Storage and
// hashing are injected so the rules — one account per device, lockout after
// repeated wrong passwords, sign-out keeps the account — are tested for real.
import { create } from 'zustand';
import {
  createAccount, LOCKOUT_MS, MAX_ATTEMPTS, normalizeEmail, parseAccount, passwordMatches, validateEmail, validatePassword,
  type Account, type Hasher,
} from './model';

export interface Vault { get: (key: string) => Promise<string | null>; set: (key: string, value: string) => Promise<void>; remove: (key: string) => Promise<void> }
export interface AuthDeps { vault: Vault; hash: Hasher; salt: () => string; now: () => Date }

export const ACCOUNT_KEY = 'comicpill.auth.account';
export const SESSION_KEY = 'comicpill.auth.session';
/** Survives removing the account, so signing up again with the SAME email keeps your data. */
export const LAST_EMAIL_KEY = 'comicpill.auth.lastEmail';

export type AuthResult = { ok: true; fresh?: boolean } | { ok: false; message: string; replaces?: string };
const fail = (message: string): AuthResult => ({ ok: false, message });

interface AuthState {
  status: 'loading' | 'signedOut' | 'signedIn';
  /** An account exists on this device (so Sign up is replaced by Sign in). */
  hasAccount: boolean;
  email: string | null;
  load: () => Promise<void>;
  /** `replace`: the reader agreed to swap the account already on this phone for this new one. */
  signUp: (email: string, password: string, replace?: boolean) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  /** Forgot your password: with no server, the only way back in is to remove the account on this phone and make a new one. Comics and taste are untouched. */
  removeAccount: () => Promise<void>;
}

export function createAuthStore(deps: AuthDeps) {
  let account: Account | null = null;
  let failures = 0;
  let lockedUntil = 0;

  return create<AuthState>()((set, get) => ({
    status: 'loading', hasAccount: false, email: null,

    load: async () => {
      if (get().status !== 'loading') return;
      try {
        account = parseAccount(await deps.vault.get(ACCOUNT_KEY));
        const session = account ? (await deps.vault.get(SESSION_KEY)) === account.email : false;
        set({ hasAccount: !!account, status: session ? 'signedIn' : 'signedOut', email: session ? account!.email : null });
      } catch {
        set({ status: 'signedOut', hasAccount: false, email: null });
      }
    },

    signUp: async (email, password, replace = false) => {
      const bad = validateEmail(email) ?? validatePassword(password);
      if (bad) return fail(bad);
      if (account && normalizeEmail(email) === account.email) return fail('That email already has an account on this phone. Please sign in.');
      if (account && !replace) return { ok: false, message: `This phone already has an account (${account.email}).`, replaces: account.email };
      try {
        const created = await createAccount(email, password, { salt: deps.salt, hash: deps.hash, now: deps.now() });
        await deps.vault.set(ACCOUNT_KEY, JSON.stringify(created));
        await deps.vault.set(SESSION_KEY, created.email);
        // A different email than last time means a different person: they start fresh.
        const last = await deps.vault.get(LAST_EMAIL_KEY).catch(() => null);
        await deps.vault.set(LAST_EMAIL_KEY, created.email).catch(() => undefined);
        account = created;
        set({ hasAccount: true, status: 'signedIn', email: created.email });
        return { ok: true, fresh: last !== created.email };
      } catch {
        return fail('Couldn’t create the account on this phone. Please try again.');
      }
    },

    signIn: async (email, password) => {
      const bad = validateEmail(email);
      if (bad) return fail(bad);
      if (!password) return fail('Enter your password.');
      if (!account) return fail('There’s no account on this phone yet. Create one first.');
      const t = deps.now().getTime();
      if (t < lockedUntil) return fail(`Too many tries. Wait ${Math.ceil((lockedUntil - t) / 1000)} seconds and try again.`);
      if (!(await passwordMatches(account, email, password, deps.hash))) {
        failures += 1;
        if (failures >= MAX_ATTEMPTS) { lockedUntil = t + LOCKOUT_MS; failures = 0; }
        return fail('That email and password don’t match.');
      }
      failures = 0;
      try { await deps.vault.set(SESSION_KEY, account.email); } catch { return fail('Couldn’t sign you in on this phone. Please try again.'); }
      set({ status: 'signedIn', email: account.email });
      return { ok: true };
    },

    signOut: async () => {
      await deps.vault.remove(SESSION_KEY).catch(() => undefined);
      set({ status: 'signedOut', email: null });
    },

    removeAccount: async () => {
      await Promise.all([deps.vault.remove(ACCOUNT_KEY), deps.vault.remove(SESSION_KEY)]).catch(() => undefined);
      account = null; failures = 0; lockedUntil = 0;
      set({ hasAccount: false, status: 'signedOut', email: null });
    },
  }));
}

export { normalizeEmail };
