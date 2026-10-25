import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, initialOf, LIMITS, sameProfile, sanitizeProfile, validateProfile, type UserProfile } from './profileModel';

const p = (over: Partial<UserProfile> = {}): UserProfile => ({ ...DEFAULT_PROFILE, ...over });

describe('validateProfile', () => {
  it('accepts the default profile', () => {
    expect(validateProfile(DEFAULT_PROFILE).ok).toBe(true);
  });
  it('normalizes whitespace and username case', () => {
    const v = validateProfile(p({ displayName: '  Mukund   U ', username: '  Mukund.U ', bio: '  hello   world  ' }));
    expect(v.ok).toBe(true);
    expect(v.value).toMatchObject({ displayName: 'Mukund U', username: 'mukund.u', bio: 'hello world' });
  });
  it.each([
    ['empty name', { displayName: '   ' }, 'displayName'],
    ['long name', { displayName: 'x'.repeat(LIMITS.displayName + 1) }, 'displayName'],
    ['short username', { username: 'ab' }, 'username'],
    ['long username', { username: 'a'.repeat(21) }, 'username'],
    ['spaces in username', { username: 'has space' }, 'username'],
    ['symbols in username', { username: 'no!pe' }, 'username'],
    ['leading dot', { username: '.abc' }, 'username'],
    ['trailing dot', { username: 'abc.' }, 'username'],
    ['double dot', { username: 'a..b' }, 'username'],
    ['long bio', { bio: 'x'.repeat(LIMITS.bio + 1) }, 'bio'],
    ['goal 0', { monthlyGoal: 0 }, 'monthlyGoal'],
    ['goal 31', { monthlyGoal: 31 }, 'monthlyGoal'],
    ['goal NaN', { monthlyGoal: NaN }, 'monthlyGoal'],
  ] as const)('rejects %s', (_n, over, field) => {
    const v = validateProfile(p(over));
    expect(v.ok).toBe(false);
    expect(v.errors[field]).toBeTruthy();
  });
  it('reports every problem at once, not just the first', () => {
    const v = validateProfile(p({ displayName: '', username: 'x', monthlyGoal: 99 }));
    expect(Object.keys(v.errors).sort()).toEqual(['displayName', 'monthlyGoal', 'username']);
  });
  it('allows the boundary values', () => {
    expect(validateProfile(p({ username: 'abc', monthlyGoal: 1 })).ok).toBe(true);
    expect(validateProfile(p({ username: 'a'.repeat(20), monthlyGoal: 30, displayName: 'x'.repeat(30), bio: 'y'.repeat(140) })).ok).toBe(true);
  });
});

describe('sanitizeProfile (reading back from storage)', () => {
  it('recovers from garbage with the defaults', () => {
    for (const bad of [null, 'x', 7, []]) expect(sanitizeProfile(bad)).toEqual(DEFAULT_PROFILE);
  });
  it('keeps valid fields even when one field is bad', () => {
    const s = sanitizeProfile({ displayName: 'Ada', username: 'NOT VALID!', monthlyGoal: 6 });
    expect(s).toMatchObject({ displayName: 'Ada', username: DEFAULT_PROFILE.username, monthlyGoal: 6 });
  });
  it('only accepts image data URIs of sane size as an avatar', () => {
    expect(sanitizeProfile({ avatar: 'data:image/jpeg;base64,AAAA' }).avatar).toBe('data:image/jpeg;base64,AAAA');
    expect(sanitizeProfile({ avatar: 'https://evil.example/x.png' }).avatar).toBeNull();
    expect(sanitizeProfile({ avatar: 'javascript:alert(1)' }).avatar).toBeNull();
    expect(sanitizeProfile({ avatar: 'data:image/jpeg;base64,' + 'A'.repeat(500_000) }).avatar).toBeNull();
    expect(sanitizeProfile({ avatar: 42 }).avatar).toBeNull();
  });
});

describe('helpers', () => {
  it('picks an initial', () => {
    expect(initialOf({ displayName: 'ada', username: 'x' })).toBe('A');
    expect(initialOf({ displayName: '  ', username: 'zed' })).toBe('Z');
    expect(initialOf({ displayName: '', username: '' })).toBe('?');
  });
  it('detects an unchanged profile', () => {
    expect(sameProfile(p(), p())).toBe(true);
    expect(sameProfile(p(), p({ bio: 'changed' }))).toBe(false);
    expect(sameProfile(p(), p({ avatar: 'data:image/png;base64,A' }))).toBe(false);
  });
});
