// Persistence, tested for real: a fake storage stands in for AsyncStorage.
import { describe, expect, it } from 'vitest';
import { createSettingsStore, SETTINGS_KEY } from './settingsStore';
import { createProfileStore, PROFILE_KEY } from './profileStore';
import { DEFAULT_SETTINGS } from '../settings/model';
import { DEFAULT_PROFILE } from '../settings/profileModel';

function memoryStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: async (k: string) => data.get(k) ?? null,
    setItem: async (k: string, v: string) => { data.set(k, v); },
    removeItem: async (k: string) => { data.delete(k); },
  };
}
const wrap = (state: unknown, version = 1) => JSON.stringify({ state, version });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('settings store', () => {
  it('starts at the defaults', () => {
    expect(createSettingsStore(memoryStorage()).getState().haptics).toBe(DEFAULT_SETTINGS.haptics);
  });
  it('persists a change and restores it in a new store (a relaunch)', async () => {
    const storage = memoryStorage();
    const a = createSettingsStore(storage);
    a.getState().update({ haptics: false, reminderHour: 7, remindersEnabled: true });
    await flush();
    const b = createSettingsStore(storage);
    await b.persist.rehydrate();
    expect(b.getState()).toMatchObject({ haptics: false, reminderHour: 7, remindersEnabled: true });
  });
  it('clamps an invalid update instead of storing it', () => {
    const s = createSettingsStore(memoryStorage());
    s.getState().update({ reminderHour: 99, defaultJourneyDepth: 'nope' as never });
    expect(s.getState().reminderHour).toBe(23);
    expect(s.getState().defaultJourneyDepth).toBe('recommended');
  });
  it('recovers from corrupted stored data', async () => {
    const s = createSettingsStore(memoryStorage({ [SETTINGS_KEY]: wrap({ haptics: 'banana', reminderMinute: 1e9, junk: true }) }));
    await s.persist.rehydrate();
    expect(s.getState().haptics).toBe(true);
    expect(s.getState().reminderMinute).toBe(59);
    expect(s.getState()).not.toHaveProperty('junk');
  });
  it('survives storage that is not JSON at all', async () => {
    const s = createSettingsStore(memoryStorage({ [SETTINGS_KEY]: '{not json' }));
    await Promise.resolve(s.persist.rehydrate()).catch(() => undefined);
    expect(s.getState().haptics).toBe(true);
  });
  it('reset restores the defaults and persists that', async () => {
    const storage = memoryStorage();
    const s = createSettingsStore(storage);
    s.getState().update({ haptics: false });
    s.getState().reset();
    await flush();
    expect(JSON.parse(storage.data.get(SETTINGS_KEY)!).state.haptics).toBe(true);
  });
  it('never persists the action functions', async () => {
    const storage = memoryStorage();
    createSettingsStore(storage).getState().update({ haptics: false });
    await flush();
    expect(Object.keys(JSON.parse(storage.data.get(SETTINGS_KEY)!).state).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });
});

describe('profile store', () => {
  const edited = { ...DEFAULT_PROFILE, displayName: 'Ada', username: 'ada.l', bio: 'Reads a lot.', monthlyGoal: 8 };

  it('saves a valid profile, normalized, and persists it', async () => {
    const storage = memoryStorage();
    const a = createProfileStore(storage);
    expect(a.getState().save({ ...edited, username: '  ADA.L ' })).toBe(true);
    expect(a.getState().username).toBe('ada.l');
    await flush();
    const b = createProfileStore(storage);
    await b.persist.rehydrate();
    expect(b.getState()).toMatchObject({ displayName: 'Ada', username: 'ada.l', monthlyGoal: 8 });
  });
  it('refuses an invalid profile and changes nothing', () => {
    const s = createProfileStore(memoryStorage());
    expect(s.getState().save({ ...edited, username: '!!' })).toBe(false);
    expect(s.getState().displayName).toBe(DEFAULT_PROFILE.displayName);
  });
  it('keeps a photo across relaunches, and drops a tampered one', async () => {
    const storage = memoryStorage();
    const a = createProfileStore(storage);
    a.getState().save({ ...edited, avatar: 'data:image/jpeg;base64,QUJD' });
    await flush();
    const b = createProfileStore(storage);
    await b.persist.rehydrate();
    expect(b.getState().avatar).toBe('data:image/jpeg;base64,QUJD');

    const c = createProfileStore(memoryStorage({ [PROFILE_KEY]: wrap({ ...edited, avatar: 'file:///etc/passwd' }) }));
    await c.persist.rehydrate();
    expect(c.getState().avatar).toBeNull();
  });
  it('reset returns to the defaults', () => {
    const s = createProfileStore(memoryStorage());
    s.getState().save(edited);
    s.getState().reset();
    expect(s.getState().displayName).toBe(DEFAULT_PROFILE.displayName);
  });
});

describe('onboarding store', () => {
  it('resumes at the same stage with the same picks after a relaunch', async () => {
    const { createOnboardingStore } = await import('./onboardingStore');
    const storage = memoryStorage();
    const a = createOnboardingStore(storage);
    a.getState().begin();
    a.getState().next();
    a.getState().toggle('characters', 'char:batman');
    a.getState().toggle('characters', 'char:nightwing');
    a.getState().toggle('characters', 'char:batman'); // un-pick
    await flush();
    const b = createOnboardingStore(storage);
    await b.persist.rehydrate();
    expect(b.getState().stage).toBe('characters');
    expect(b.getState().selections.characters).toEqual(['char:nightwing']);
  });
  it('survives corrupt storage', async () => {
    const { createOnboardingStore, ONBOARDING_KEY } = await import('./onboardingStore');
    const s = createOnboardingStore(memoryStorage({ [ONBOARDING_KEY]: wrap({ stage: 'nope', selections: 5 }) }));
    await s.persist.rehydrate();
    expect(s.getState().stage).toBe('welcome');
  });
  it('editing skips the tour and never un-completes onboarding', () => {
    return import('./onboardingStore').then(({ createOnboardingStore }) => {
      const s = createOnboardingStore(memoryStorage());
      s.getState().finish();
      s.getState().begin(true);
      expect(s.getState().completed).toBe(true);
      expect(s.getState().stage).toBe('characters');
      s.getState().goTo('traits');
      s.getState().next();
      expect(s.getState().stage).toBe('done');
    });
  });
  it('back stops at the first picking step when editing', async () => {
    const { createOnboardingStore } = await import('./onboardingStore');
    const s = createOnboardingStore(memoryStorage());
    s.getState().begin(true);
    s.getState().back();
    expect(s.getState().stage).toBe('characters');
  });
});
