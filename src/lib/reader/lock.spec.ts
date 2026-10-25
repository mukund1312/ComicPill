import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { checkPassword, isHiddenByFolder, isUnlocked, makeLock, markUnlocked, passwordProblem, relockAll } from './lock';

const sha = async (t: string) => createHash('sha256').update(t).digest('hex');

describe('lock', () => {
  it('accepts the right password and rejects the wrong ones', async () => {
    const lock = await makeLock('hunter22', sha, 'salt-1');
    expect(await checkPassword('hunter22', lock, sha)).toBe(true);
    expect(await checkPassword('hunter23', lock, sha)).toBe(false);
    expect(await checkPassword('', lock, sha)).toBe(false);
    expect(await checkPassword('HUNTER22', lock, sha)).toBe(false);
  });
  it('never stores the password, and the same password gets a different hash with a different salt', async () => {
    const a = await makeLock('hunter22', sha, 'salt-1'); const b = await makeLock('hunter22', sha, 'salt-2');
    expect(JSON.stringify(a)).not.toContain('hunter22');
    expect(a.hash).not.toBe(b.hash);
  });
  it('a hash from another salt does not unlock', async () => {
    const a = await makeLock('hunter22', sha, 'salt-1');
    expect(await checkPassword('hunter22', { ...a, salt: 'salt-2' }, sha)).toBe(false);
  });
  it('asks for a sensible length', () => {
    expect(passwordProblem('abc')).toMatch(/at least 4/);
    expect(passwordProblem('abcd')).toBeNull();
  });
});

describe('unlocked this session', () => {
  beforeEach(() => relockAll());
  it('remembers what was opened, until it is locked again', () => {
    expect(isUnlocked('comic', 'a')).toBe(false);
    markUnlocked('comic', 'a');
    expect(isUnlocked('comic', 'a')).toBe(true);
    expect(isUnlocked('folder', 'a')).toBe(false);
    relockAll();
    expect(isUnlocked('comic', 'a')).toBe(false);
  });
});

describe('folders hide their comics', () => {
  it('only while the folder is locked and not yet opened', () => {
    const c = { folderId: 'f1' };
    expect(isHiddenByFolder(c, new Set(['f1']), new Set())).toBe(true);
    expect(isHiddenByFolder(c, new Set(['f1']), new Set(['f1']))).toBe(false);
    expect(isHiddenByFolder(c, new Set(), new Set())).toBe(false);
    expect(isHiddenByFolder({ folderId: null }, new Set(['f1']), new Set())).toBe(false);
  });
});
