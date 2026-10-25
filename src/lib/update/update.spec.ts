import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { checkForUpdate, dismissVersion, isDismissed, type KeyValueStorage, type UpdateFetch } from './check';
import { APK_URL_PREFIX, compareVersions, isTrustedApkUrl, parseManifest, shouldCheck, updateStatus } from './manifest';

const APK = `${APK_URL_PREFIX}latest/download/comicpill.apk`;
const manifest = (over: Record<string, unknown> = {}) => ({ latest: '1.2.0', apkUrl: APK, notes: 'Journeys and scanning.', minSupported: null, ...over });

describe('compareVersions', () => {
  it.each([
    ['1.0.0', '1.0.0', 0], ['1.0.1', '1.0.0', 1], ['1.0.0', '1.0.1', -1],
    ['1.10.0', '1.9.0', 1], // numeric, not alphabetical
    ['2.0.0', '1.99.99', 1], ['1.0', '1.0.0', 0], ['1.0.0.1', '1.0.0', 1],
  ])('%s vs %s -> %i', (a, b, want) => expect(compareVersions(a, b)).toBe(want));
});

describe('parseManifest — the manifest is untrusted', () => {
  it('accepts a good manifest', () => {
    expect(parseManifest(manifest())).toEqual({ latest: '1.2.0', apkUrl: APK, notes: 'Journeys and scanning.', minSupported: null });
  });
  it('rejects a download link that is not under this project’s releases', () => {
    for (const apkUrl of ['https://evil.example/comicpill.apk', 'http://github.com/mukund1312/ComicPill/releases/x.apk', 'https://github.com/someone-else/ComicPill/releases/x.apk', 'javascript:alert(1)', '']) {
      expect(parseManifest(manifest({ apkUrl }))).toBeNull();
    }
  });
  it('rejects malformed versions and shapes', () => {
    for (const bad of [null, 'x', [], {}, manifest({ latest: 'latest' }), manifest({ latest: '1.2' }), manifest({ latest: '1.2.0-beta' }), manifest({ minSupported: 'old' }), manifest({ notes: 'x'.repeat(301) })]) {
      expect(parseManifest(bad)).toBeNull();
    }
  });
  it('treats optional fields as null', () => {
    expect(parseManifest({ latest: '1.0.0', apkUrl: APK })).toMatchObject({ notes: null, minSupported: null });
  });
  it('only trusts project release links at click time too', () => {
    expect(isTrustedApkUrl(APK)).toBe(true);
    expect(isTrustedApkUrl('https://evil.example/a.apk')).toBe(false);
    expect(isTrustedApkUrl(`${APK} https://evil.example`)).toBe(false);
  });
});

describe('updateStatus', () => {
  const m = (over = {}) => parseManifest(manifest(over))!;
  it('is up to date on the same or a newer version (a dev build ahead of the release)', () => {
    expect(updateStatus('1.2.0', m())).toEqual({ kind: 'up_to_date' });
    expect(updateStatus('1.3.0', m())).toEqual({ kind: 'up_to_date' });
  });
  it('offers an update on an older version', () => {
    expect(updateStatus('1.0.0', m())).toMatchObject({ kind: 'available', latest: '1.2.0', apkUrl: APK });
  });
  it('marks it required only below minSupported', () => {
    expect(updateStatus('1.0.0', m({ minSupported: '1.1.0' })).kind).toBe('required');
    expect(updateStatus('1.1.0', m({ minSupported: '1.1.0' })).kind).toBe('available');
  });
});

describe('shouldCheck', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  it('checks when never checked, or after a day', () => {
    expect(shouldCheck(null, now)).toBe(true);
    expect(shouldCheck('2026-09-30T11:00:00Z', now)).toBe(true);
  });
  it('waits within the interval', () => {
    expect(shouldCheck('2026-10-01T06:00:00Z', now)).toBe(false);
  });
  it('recovers from a bad or future timestamp', () => {
    expect(shouldCheck('garbage', now)).toBe(true);
    expect(shouldCheck('2027-01-01T00:00:00Z', now)).toBe(true);
  });
});

const memory = (seed: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } => {
  const data = new Map(Object.entries(seed));
  return { data, getItem: async (k) => data.get(k) ?? null, setItem: async (k, v) => { data.set(k, v); } };
};
const serve = (json: unknown, ok = true): UpdateFetch => vi.fn(async () => ({ ok, json: async () => json }));
const calls = (f: UpdateFetch) => (f as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
const NOW = new Date('2026-10-01T12:00:00Z');

describe('checkForUpdate', () => {
  it('reports an available update and records the check', async () => {
    const storage = memory();
    const r = await checkForUpdate('1.0.0', { storage, fetchImpl: serve(manifest()), now: NOW });
    expect(r).toMatchObject({ kind: 'available', latest: '1.2.0' });
    expect(storage.data.get('@comicpill/update/lastCheck')).toBe(NOW.toISOString());
  });
  it('does not hit the network again within a day', async () => {
    const f = serve(manifest());
    const storage = memory({ '@comicpill/update/lastCheck': '2026-10-01T06:00:00Z' });
    expect(await checkForUpdate('1.0.0', { storage, fetchImpl: f, now: NOW })).toBeNull();
    expect(calls(f)).toBe(0);
  });
  it('force ignores the daily limit (the reader tapped "Check for updates")', async () => {
    const f = serve(manifest());
    const storage = memory({ '@comicpill/update/lastCheck': '2026-10-01T06:00:00Z' });
    expect(await checkForUpdate('1.0.0', { storage, fetchImpl: f, now: NOW, force: true })).toMatchObject({ kind: 'available' });
  });
  it('quietly returns null on network failure, HTTP error, bad JSON or a bad manifest', async () => {
    const throws: UpdateFetch = async () => { throw new Error('offline'); };
    const badJson: UpdateFetch = async () => ({ ok: true, json: async () => { throw new Error('html'); } });
    for (const f of [throws, serve({}, false), badJson, serve({ latest: '9.9.9', apkUrl: 'https://evil.example/x.apk' })]) {
      expect(await checkForUpdate('1.0.0', { storage: memory(), fetchImpl: f, now: NOW })).toBeNull();
    }
  });
  it('does not mark a failed check as done, so it retries next launch', async () => {
    const storage = memory();
    await checkForUpdate('1.0.0', { storage, fetchImpl: serve({}, false), now: NOW });
    expect(storage.data.has('@comicpill/update/lastCheck')).toBe(false);
  });
  it('survives broken storage', async () => {
    const broken: KeyValueStorage = { getItem: async () => { throw new Error('x'); }, setItem: async () => { throw new Error('x'); } };
    expect(await checkForUpdate('1.0.0', { storage: broken, fetchImpl: serve(manifest()), now: NOW })).toBeNull();
  });
  it('gives up on a hung server', async () => {
    const hang: UpdateFetch = (_u, init) => new Promise((_res, rej) => { init.signal.addEventListener('abort', () => rej(new Error('aborted'))); });
    expect(await checkForUpdate('1.0.0', { storage: memory(), fetchImpl: hang, now: NOW, timeoutMs: 20 })).toBeNull();
  });
});

describe('dismissing', () => {
  it('remembers one version, and a newer one shows again', async () => {
    const s = memory();
    expect(await isDismissed('1.2.0', s)).toBe(false);
    await dismissVersion('1.2.0', s);
    expect(await isDismissed('1.2.0', s)).toBe(true);
    expect(await isDismissed('1.3.0', s)).toBe(false);
  });
});


describe('the published manifest file', () => {
  const root = join(__dirname, '..', '..', '..');
  const published = JSON.parse(readFileSync(join(root, 'docs', 'version.json'), 'utf8'));
  const appVersion = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo.version as string;

  it('is accepted by the app’s own parser (so a release can’t ship a manifest the app rejects)', () => {
    expect(parseManifest(published)).not.toBeNull();
  });
  it('never claims a version older than the app in this checkout', () => {
    expect(compareVersions(published.latest, appVersion)).toBeGreaterThanOrEqual(0);
  });
});
