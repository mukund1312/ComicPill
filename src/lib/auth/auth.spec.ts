import { describe, expect, it } from 'vitest';
import { createAuthStore, ACCOUNT_KEY, SESSION_KEY, type Vault } from './store';
import { LOCKOUT_MS, parseAccount, sameHash, validateEmail, validatePassword } from './model';

function setup(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  const vault: Vault = { get: async (k) => data.get(k) ?? null, set: async (k, v) => { data.set(k, v); }, remove: async (k) => { data.delete(k); } };
  let clock = 1_000_000;
  let n = 0;
  const store = createAuthStore({ vault, hash: async (s, p) => `x${[...`${s}:${p}`].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7)}`, salt: () => `salt${++n}`, now: () => new Date(clock) });
  return { store, data, tick: (ms: number) => { clock += ms; } };
}

describe('validation', () => {
  it('accepts normal emails and rejects junk', () => {
    expect(validateEmail('  Mukund@Example.com ')).toBeNull();
    for (const bad of ['', 'nope', 'a@b', 'a b@c.com', '@x.com', 'a@@x.com']) expect(validateEmail(bad)).not.toBeNull();
  });
  it('wants a password of 8 or more', () => {
    expect(validatePassword('1234567')).not.toBeNull();
    expect(validatePassword('12345678')).toBeNull();
    expect(validatePassword('x'.repeat(129))).not.toBeNull();
  });
  it('compares hashes strictly', () => {
    expect(sameHash('abc', 'abc')).toBe(true);
    expect(sameHash('abc', 'abd')).toBe(false);
    expect(sameHash('abc', 'abcd')).toBe(false);
  });
  it('treats a broken stored account as no account', () => {
    for (const raw of [null, '', 'not json', '{}', JSON.stringify({ email: 'bad', salt: 's', hash: 'h' }), JSON.stringify({ email: 'a@b.co', salt: '', hash: 'h' })]) expect(parseAccount(raw)).toBeNull();
  });
});

describe('signing up and in', () => {
  it('creates an account, signs in, and never stores the password', async () => {
    const { store, data } = setup();
    await store.getState().load();
    expect(store.getState().status).toBe('signedOut');
    expect(await store.getState().signUp('Me@Example.com', 'correct horse')).toEqual({ ok: true, fresh: false });
    expect(store.getState()).toMatchObject({ status: 'signedIn', email: 'me@example.com', hasAccount: true });
    expect(data.get(ACCOUNT_KEY)).not.toContain('correct horse');
  });
  it('rejects bad input before touching storage', async () => {
    const { store, data } = setup();
    await store.getState().load();
    expect((await store.getState().signUp('nope', 'correct horse')).ok).toBe(false);
    expect((await store.getState().signUp('me@example.com', 'short')).ok).toBe(false);
    expect(data.size).toBe(0);
  });
  it('keeps one account per phone: another email must agree to replace it', async () => {
    const { store } = setup();
    await store.getState().load();
    await store.getState().signUp('me@example.com', 'correct horse');
    await store.getState().signOut();
    const ask = await store.getState().signUp('other@example.com', 'another one!');
    expect(ask).toMatchObject({ ok: false, replaces: 'me@example.com' });
    expect(store.getState().email).toBeNull();
    expect(await store.getState().signUp('other@example.com', 'another one!', true)).toEqual({ ok: true, fresh: true });
    expect(store.getState()).toMatchObject({ status: 'signedIn', email: 'other@example.com' });
    // the old account is gone: its password no longer works
    await store.getState().signOut();
    expect((await store.getState().signIn('me@example.com', 'correct horse')).ok).toBe(false);
  });
  it('the same email can only sign in, not sign up again', async () => {
    const { store } = setup();
    await store.getState().load();
    await store.getState().signUp('me@example.com', 'correct horse');
    await store.getState().signOut();
    const r = await store.getState().signUp('ME@example.com', 'something else!', true);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.replaces).toBeUndefined();
  });
  it('signs out and back in; wrong password or wrong email is refused', async () => {
    const { store } = setup();
    await store.getState().load();
    await store.getState().signUp('me@example.com', 'correct horse');
    await store.getState().signOut();
    expect(store.getState().status).toBe('signedOut');
    expect((await store.getState().signIn('me@example.com', 'wrong pass!')).ok).toBe(false);
    expect((await store.getState().signIn('you@example.com', 'correct horse')).ok).toBe(false);
    expect(store.getState().status).toBe('signedOut');
    expect(await store.getState().signIn(' ME@example.com ', 'correct horse')).toEqual({ ok: true });
    expect(store.getState().status).toBe('signedIn');
  });
  it('cannot sign in with no account', async () => {
    const { store } = setup();
    await store.getState().load();
    expect((await store.getState().signIn('me@example.com', 'whatever1')).ok).toBe(false);
  });
});

describe('staying signed in', () => {
  it('comes back signed in after a relaunch, and signed out after sign-out', async () => {
    const a = setup();
    await a.store.getState().load();
    await a.store.getState().signUp('me@example.com', 'correct horse');
    const relaunch = createAuthStore({ vault: { get: async (k) => a.data.get(k) ?? null, set: async () => undefined, remove: async () => undefined }, hash: async () => '', salt: () => '', now: () => new Date() });
    await relaunch.getState().load();
    expect(relaunch.getState()).toMatchObject({ status: 'signedIn', email: 'me@example.com' });
    await a.store.getState().signOut();
    expect(a.data.has(SESSION_KEY)).toBe(false);
    expect(a.data.has(ACCOUNT_KEY)).toBe(true);
  });
  it('a session for a different email does not count', async () => {
    const a = setup();
    await a.store.getState().load();
    await a.store.getState().signUp('me@example.com', 'correct horse');
    a.data.set(SESSION_KEY, 'someone@else.com');
    const b = createAuthStore({ vault: { get: async (k) => a.data.get(k) ?? null, set: async () => undefined, remove: async () => undefined }, hash: async () => '', salt: () => '', now: () => new Date() });
    await b.getState().load();
    expect(b.getState().status).toBe('signedOut');
  });
});

describe('a different person', () => {
  it('keeps the shelf for the first account on a phone (it was used without one), starts fresh only when the email changes', async () => {
    const { store } = setup();
    await store.getState().load();
    expect(await store.getState().signUp('me@example.com', 'correct horse')).toEqual({ ok: true, fresh: false });
    await store.getState().removeAccount();
    expect(await store.getState().signUp('Me@Example.com', 'a new password')).toEqual({ ok: true, fresh: false });
    await store.getState().removeAccount();
    expect(await store.getState().signUp('someone@else.com', 'a new password')).toEqual({ ok: true, fresh: true });
  });
  it('deleting the account for good forgets it, so the next account (any email) keeps the shelf', async () => {
    const { store } = setup();
    await store.getState().load();
    await store.getState().signUp('me@example.com', 'correct horse');
    await store.getState().removeAccount(true);
    expect(store.getState()).toMatchObject({ status: 'signedOut', hasAccount: false });
    expect(await store.getState().signUp('someone@else.com', 'a new password')).toEqual({ ok: true, fresh: false });
  });
});

describe('guessing and forgetting', () => {
  it('locks out after five wrong passwords, then lets the right one in once the wait is over', async () => {
    const { store, tick } = setup();
    await store.getState().load();
    await store.getState().signUp('me@example.com', 'correct horse');
    await store.getState().signOut();
    for (let i = 0; i < 5; i++) await store.getState().signIn('me@example.com', 'bad guess1');
    const locked = await store.getState().signIn('me@example.com', 'correct horse');
    expect(locked.ok).toBe(false);
    expect(locked.ok === false && locked.message).toMatch(/wait/i);
    tick(LOCKOUT_MS + 1);
    expect((await store.getState().signIn('me@example.com', 'correct horse')).ok).toBe(true);
  });
  it('removing the account lets you start again', async () => {
    const { store, data } = setup();
    await store.getState().load();
    await store.getState().signUp('me@example.com', 'correct horse');
    await store.getState().removeAccount();
    expect(store.getState()).toMatchObject({ status: 'signedOut', hasAccount: false });
    expect(data.has(ACCOUNT_KEY)).toBe(false);
    expect((await store.getState().signUp('new@example.com', 'brand new pw')).ok).toBe(true);
  });
});
