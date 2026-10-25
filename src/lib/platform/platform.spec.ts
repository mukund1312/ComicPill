import { describe, expect, it, vi } from 'vitest';
import { actionFor, NOTIFICATIONS_UNAVAILABLE_MESSAGE, notificationsSupported, PERMISSION_COPY, STATE_LABEL, toPermissionState } from './permissionsCore';
import { reminderContent } from './remindersCore';
import { createFeedback, type HapticDevice } from './feedbackCore';

describe('toPermissionState', () => {
  it('maps every real-world combination', () => {
    expect(toPermissionState({ granted: true, undetermined: false, canAskAgain: true })).toBe('granted');
    expect(toPermissionState({ granted: false, undetermined: true, canAskAgain: true })).toBe('not_asked');
    expect(toPermissionState({ granted: false, undetermined: false, canAskAgain: true })).toBe('denied'); // Android: may ask again
    expect(toPermissionState({ granted: false, undetermined: false, canAskAgain: false })).toBe('blocked'); // iOS / "don't ask again"
    expect(toPermissionState(null)).toBe('not_asked');
  });
  it('granted wins even if the other flags disagree', () => {
    expect(toPermissionState({ granted: true, undetermined: true, canAskAgain: false })).toBe('granted');
  });
});

describe('what to do about each state', () => {
  it('asks when it can, sends to Settings when only Settings can help, does nothing when allowed', () => {
    expect(actionFor('not_asked')).toBe('request');
    expect(actionFor('denied')).toBe('request');
    expect(actionFor('blocked')).toBe('open_settings');
    expect(actionFor('granted')).toBe('none');
    expect(actionFor('unavailable')).toBe('none'); // nothing the reader can do inside the app
  });
  it('every permission has an honest reason and every state a label', () => {
    for (const k of ['camera', 'photos', 'notifications'] as const) expect(PERMISSION_COPY[k].why.length).toBeGreaterThan(10);
    for (const s of ['granted', 'not_asked', 'denied', 'blocked', 'unavailable'] as const) expect(STATE_LABEL[s]).toBeTruthy();
  });
});

describe('reminderContent', () => {
  it('names the next book in the journey when there is one', () => {
    expect(reminderContent('Batman: Dark Victory').body).toBe('Batman: Dark Victory is next in your journey.');
  });
  it('is a plain, non-guilting nudge otherwise', () => {
    const c = reminderContent(null);
    expect(c.title.length).toBeGreaterThan(0);
    expect(c.body).not.toMatch(/miss|forgot|streak|haven/i);
  });
});

describe('haptic feedback', () => {
  const device = (): HapticDevice & { calls: string[] } => {
    const calls: string[] = [];
    return {
      calls,
      impact: vi.fn(async (w) => { calls.push(`impact:${w}`); }),
      select: vi.fn(async () => { calls.push('select'); }),
      notify: vi.fn(async (t) => { calls.push(`notify:${t}`); }),
    };
  };
  it('fires when enabled', () => {
    const d = device();
    const f = createFeedback(() => true, d);
    f.tap(); f.select(); f.success(); f.warning();
    expect(d.calls).toEqual(['impact:light', 'select', 'notify:success', 'notify:warning']);
  });
  it('is silent when the reader turned haptics off — and reads the setting live', () => {
    const d = device();
    let on = false;
    const f = createFeedback(() => on, d);
    f.tap();
    expect(d.calls).toEqual([]);
    on = true;
    f.tap();
    expect(d.calls).toEqual(['impact:light']);
  });
  it('never throws into a press handler, even if the device fails', () => {
    const boom: HapticDevice = {
      impact: () => { throw new Error('no haptic engine'); },
      select: () => Promise.reject(new Error('nope')),
      notify: () => Promise.reject(new Error('nope')),
    };
    const f = createFeedback(() => true, boom);
    expect(() => { f.tap(); f.select(); f.success(); }).not.toThrow();
  });
});

describe('notificationsSupported (the Expo Go crash)', () => {
  it('is unsupported ONLY in Expo Go on Android, where importing the module throws', () => {
    expect(notificationsSupported('android', 'storeClient')).toBe(false);
  });
  it('works in a development or production build on Android', () => {
    expect(notificationsSupported('android', 'bare')).toBe(true);
    expect(notificationsSupported('android', 'standalone')).toBe(true);
  });
  it('works everywhere on iOS, including Expo Go (local notifications only)', () => {
    expect(notificationsSupported('ios', 'storeClient')).toBe(true);
    expect(notificationsSupported('ios', 'bare')).toBe(true);
  });
  it('fails open if the environment is unknown, since a real failure is caught at load time', () => {
    expect(notificationsSupported('android', undefined)).toBe(true);
    expect(notificationsSupported('android', null)).toBe(true);
  });
  it('tells the reader what to do, in plain words', () => {
    expect(NOTIFICATIONS_UNAVAILABLE_MESSAGE).toMatch(/development build/);
    expect(NOTIFICATIONS_UNAVAILABLE_MESSAGE).toMatch(/npx expo run:android/);
  });
});
