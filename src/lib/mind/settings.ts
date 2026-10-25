import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';
import { getMeta, setMeta } from '../db/queries/meta';
import { DEFAULT_WEIGHTS, type Weights } from './engine/tasteScorer';
import { DEFAULT_THRESHOLDS, type Thresholds } from './engine/verdictRules';

export type MindSettings = {
  /** The watched album. Nothing outside it is ever read. */
  albumTitle: string;
  watching: boolean;
  /** Skip the review step and send comic-looking screenshots straight away. Off until the reader trusts it. */
  autoSend: boolean;
  /** Only screenshots taken after this (ms) are picked up. */
  lastScanAt: number;
  capacity: number;
  readingDays: number;
  digestEnabled: boolean;
  /** 0 = Sunday. */
  digestDay: number;
  digestHour: number;
  digestMinute: number;
  /** Money per month for physical comics; null = no budget. */
  monthlyBudget: number | null;
  typicalPrice: number;
  spent: { month: string; amount: number };
  shelfTight: boolean;
  thresholds: Thresholds;
  weights: Weights;
  quizDone: boolean;
};

export const DEFAULT_MIND_SETTINGS: MindSettings = {
  albumTitle: 'Screenshots', watching: false, autoSend: false, lastScanAt: 0, capacity: 4, readingDays: 7,
  digestEnabled: true, digestDay: 0, digestHour: 18, digestMinute: 0, monthlyBudget: null, typicalPrice: 15,
  spent: { month: '', amount: 0 }, shelfTight: false, thresholds: DEFAULT_THRESHOLDS, weights: DEFAULT_WEIGHTS, quizDone: false,
};

const KEY = 'mind_settings';
let cache: MindSettings | null = null;
const listeners = new Set<() => void>();

function load(): MindSettings {
  try {
    const saved = JSON.parse(getMeta(KEY) ?? '{}') as Partial<MindSettings>;
    return { ...DEFAULT_MIND_SETTINGS, ...saved, thresholds: { ...DEFAULT_THRESHOLDS, ...saved.thresholds }, weights: { ...DEFAULT_WEIGHTS, ...saved.weights }, spent: { ...DEFAULT_MIND_SETTINGS.spent, ...saved.spent } };
  } catch { return DEFAULT_MIND_SETTINGS; }
}

export const getMindSettings = (): MindSettings => (cache ??= load());

export function updateMindSettings(patch: Partial<MindSettings>): MindSettings {
  cache = { ...getMindSettings(), ...patch };
  setMeta(KEY, JSON.stringify(cache));
  listeners.forEach((l) => l());
  return cache;
}

export function resetMindSettings(): void { cache = null; setMeta(KEY, ''); listeners.forEach((l) => l()); }

export function useMindSettings(): MindSettings {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getMindSettings);
}

const monthOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Money left this month, or null when there is no budget. A new month starts the count again. */
export function budgetRemaining(s: MindSettings, now: Date = new Date()): number | null {
  if (s.monthlyBudget === null) return null;
  const spent = s.spent.month === monthOf(now) ? s.spent.amount : 0;
  return s.monthlyBudget - spent;
}

export function recordSpend(amount: number, now: Date = new Date()): void {
  const s = getMindSettings(); const month = monthOf(now);
  updateMindSettings({ spent: { month, amount: (s.spent.month === month ? s.spent.amount : 0) + Math.max(0, amount) } });
}

// The Comic Vine key lives in secure storage, like the AI keys — never in settings or exports.
const CV_SLOT = 'comicpill.mind.comicvine';
let cvKey: string | null | undefined;
export async function loadComicVineKey(): Promise<string | null> {
  if (cvKey !== undefined) return cvKey;
  try { cvKey = (await SecureStore.getItemAsync(CV_SLOT)) || null; } catch { cvKey = null; }
  return cvKey;
}
export async function saveComicVineKey(key: string | null): Promise<void> {
  cvKey = key?.trim() || null;
  if (cvKey) await SecureStore.setItemAsync(CV_SLOT, cvKey); else await SecureStore.deleteItemAsync(CV_SLOT).catch(() => undefined);
}
