// App settings: the shape, the defaults, and the rules for reading them back
// from storage. Storage is untrusted (old versions, hand edits, corruption),
// so everything read back is re-validated and clamped rather than assumed.
import type { ArcDepth } from '../engines/arc/types';
import { DEFAULT_MODEL, isKnownModel } from '../ai/models';
import type { Provider } from '../ai/types';

export interface AppSettings {
  /** A daily local notification nudging the reader to open ComicPill. */
  remindersEnabled: boolean;
  reminderHour: number; // 0-23
  reminderMinute: number; // 0-59
  /** Off = Today and Compare ignore the learned taste profile and use a neutral one. */
  personalizedRecommendations: boolean;
  defaultJourneyDepth: ArcDepth;
  haptics: boolean;
  reduceMotion: boolean;
  /** Which AI provider the reader's own key belongs to. (The key itself is never stored here.) */
  aiProvider: Provider;
  aiModel: string;
  /** Once a day, ask GitHub whether a newer APK exists (Android sideload builds only). */
  checkForUpdates: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  remindersEnabled: false,
  reminderHour: 20,
  reminderMinute: 0,
  personalizedRecommendations: true,
  defaultJourneyDepth: 'recommended',
  haptics: true,
  reduceMotion: false,
  aiProvider: 'anthropic',
  aiModel: DEFAULT_MODEL.anthropic,
  checkForUpdates: true,
};

const DEPTHS: ArcDepth[] = ['essential', 'recommended', 'completionist'];

const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const intIn = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

/** Anything -> a complete, valid AppSettings. Unknown keys are dropped,
 *  missing or malformed ones fall back to the defaults. */
export function sanitizeSettings(raw: unknown): AppSettings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const aiProvider: Provider = r.aiProvider === 'openai' || r.aiProvider === 'anthropic' ? r.aiProvider : d.aiProvider;
  // A model id only counts if it belongs to the chosen provider; otherwise that provider's default.
  const aiModel = typeof r.aiModel === 'string' && isKnownModel(aiProvider, r.aiModel) ? r.aiModel : DEFAULT_MODEL[aiProvider];
  return {
    remindersEnabled: bool(r.remindersEnabled, d.remindersEnabled),
    reminderHour: intIn(r.reminderHour, 0, 23, d.reminderHour),
    reminderMinute: intIn(r.reminderMinute, 0, 59, d.reminderMinute),
    personalizedRecommendations: bool(r.personalizedRecommendations, d.personalizedRecommendations),
    defaultJourneyDepth: DEPTHS.includes(r.defaultJourneyDepth as ArcDepth) ? (r.defaultJourneyDepth as ArcDepth) : d.defaultJourneyDepth,
    haptics: bool(r.haptics, d.haptics),
    reduceMotion: bool(r.reduceMotion, d.reduceMotion),
    aiProvider,
    aiModel,
    checkForUpdates: bool(r.checkForUpdates, d.checkForUpdates),
  };
}

/** 20:05 -> "8:05 PM". */
export function formatReminderTime(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** Move a time of day by some minutes, wrapping around midnight both ways. */
export function shiftTime(hour: number, minute: number, deltaMinutes: number): { hour: number; minute: number } {
  const total = (((hour * 60 + minute + deltaMinutes) % 1440) + 1440) % 1440;
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

export const REMINDER_PRESETS: { label: string; hour: number; minute: number }[] = [
  { label: 'Morning', hour: 8, minute: 0 },
  { label: 'Lunch', hour: 12, minute: 30 },
  { label: 'Evening', hour: 18, minute: 0 },
  { label: 'Night', hour: 21, minute: 0 },
];

/** A one-line summary for the Settings row. */
export function reminderSummary(s: Pick<AppSettings, 'remindersEnabled' | 'reminderHour' | 'reminderMinute'>): string {
  return s.remindersEnabled ? `Daily at ${formatReminderTime(s.reminderHour, s.reminderMinute)}` : 'Off';
}

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[];

/** Just the settings fields of a larger object (a store state, say). */
export function pickSettings(state: AppSettings): AppSettings {
  return Object.fromEntries(SETTING_KEYS.map((k) => [k, state[k]])) as unknown as AppSettings;
}
