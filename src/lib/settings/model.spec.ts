import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, formatReminderTime, pickSettings, reminderSummary, sanitizeSettings, shiftTime } from './model';

describe('sanitizeSettings', () => {
  it('returns the defaults for anything that is not an object', () => {
    for (const bad of [null, undefined, 'x', 42, [], true]) expect(sanitizeSettings(bad)).toEqual(DEFAULT_SETTINGS);
  });
  it('keeps valid values and defaults the rest', () => {
    const s = sanitizeSettings({ haptics: false, reminderHour: 7, defaultJourneyDepth: 'essential' });
    expect(s).toMatchObject({ haptics: false, reminderHour: 7, defaultJourneyDepth: 'essential', reduceMotion: false, remindersEnabled: false });
  });
  it('clamps out-of-range times and rounds fractions', () => {
    const s = sanitizeSettings({ reminderHour: 99, reminderMinute: -5 });
    expect([s.reminderHour, s.reminderMinute]).toEqual([23, 0]);
    expect(sanitizeSettings({ reminderHour: 8.6 }).reminderHour).toBe(9);
    expect(sanitizeSettings({ reminderHour: NaN }).reminderHour).toBe(DEFAULT_SETTINGS.reminderHour);
  });
  it('rejects wrong types and unknown depths', () => {
    const s = sanitizeSettings({ haptics: 'yes', defaultJourneyDepth: 'everything', remindersEnabled: 1 });
    expect(s.haptics).toBe(true);
    expect(s.defaultJourneyDepth).toBe('recommended');
    expect(s.remindersEnabled).toBe(false);
  });
  it('drops unknown keys', () => {
    expect(sanitizeSettings({ evil: 1 })).not.toHaveProperty('evil');
    expect(Object.keys(pickSettings({ ...DEFAULT_SETTINGS, extra: 1 } as never))).toEqual(Object.keys(DEFAULT_SETTINGS));
  });
});

describe('reminder time helpers', () => {
  it('formats 12-hour times, including midnight and noon', () => {
    expect(formatReminderTime(20, 5)).toBe('8:05 PM');
    expect(formatReminderTime(0, 0)).toBe('12:00 AM');
    expect(formatReminderTime(12, 30)).toBe('12:30 PM');
    expect(formatReminderTime(9, 0)).toBe('9:00 AM');
  });
  it('shifts across midnight in both directions', () => {
    expect(shiftTime(23, 45, 30)).toEqual({ hour: 0, minute: 15 });
    expect(shiftTime(0, 10, -30)).toEqual({ hour: 23, minute: 40 });
    expect(shiftTime(8, 0, 60)).toEqual({ hour: 9, minute: 0 });
    expect(shiftTime(8, 0, 1440 * 3)).toEqual({ hour: 8, minute: 0 });
  });
  it('summarises for the Settings row', () => {
    expect(reminderSummary({ remindersEnabled: false, reminderHour: 20, reminderMinute: 0 })).toBe('Off');
    expect(reminderSummary({ remindersEnabled: true, reminderHour: 20, reminderMinute: 0 })).toBe('Daily at 8:00 PM');
  });
});

describe('AI settings', () => {
  it('defaults to Claude with its default model', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ aiProvider: 'anthropic', aiModel: 'claude-opus-5-5' });
  });
  it('keeps a valid provider + model pair', () => {
    expect(sanitizeSettings({ aiProvider: 'openai', aiModel: 'gpt-6-luna' })).toMatchObject({ aiProvider: 'openai', aiModel: 'gpt-6-luna' });
  });
  it('replaces a model that belongs to the OTHER provider with the right default', () => {
    expect(sanitizeSettings({ aiProvider: 'openai', aiModel: 'claude-opus-5-5' }).aiModel).toBe('gpt-6.1-sol');
    expect(sanitizeSettings({ aiProvider: 'anthropic', aiModel: 'gpt-6-astra' }).aiModel).toBe('claude-opus-5-5');
  });
  it('rejects unknown providers and models', () => {
    expect(sanitizeSettings({ aiProvider: 'skynet' }).aiProvider).toBe('anthropic');
    expect(sanitizeSettings({ aiProvider: 'anthropic', aiModel: 'made-up' }).aiModel).toBe('claude-opus-5-5');
    expect(sanitizeSettings({ aiModel: 42 }).aiModel).toBe('claude-opus-5-5');
  });
});

describe('update-check setting', () => {
  it('is on by default and only accepts a real boolean', () => {
    expect(DEFAULT_SETTINGS.checkForUpdates).toBe(true);
    expect(sanitizeSettings({ checkForUpdates: false }).checkForUpdates).toBe(false);
    expect(sanitizeSettings({ checkForUpdates: 'no' }).checkForUpdates).toBe(true);
  });
});
