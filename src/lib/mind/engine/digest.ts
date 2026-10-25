import { describeSlot, planWeek, type Slot } from './weekPlanner';
import type { Confidence } from './tasteScorer';
import type { ReadingOrder, Series } from './types';
import type { Verdict } from './verdictRules';

export type FindInput = {
  series: Series;
  score: number;
  confidence: Confidence;
  /** The one-line reason shown under the score. */
  reason: string;
  order: ReadingOrder;
  verdict: Verdict;
  coverUrl: string | null;
  /** The screenshot it was found in. */
  thumbUri: string | null;
  /** Not matched in any database. */
  unverified: boolean;
};

export type DigestCard = Omit<FindInput, 'series'> & {
  seriesId: string; title: string; units: number;
  /** "Read Saga vol. 1–2 by Wednesday" style lines for this card's slots. */
  plan: string[];
  /** 'week' = fits in this week's reading; 'next' = moved to Up next. */
  bucket: 'week' | 'next';
};

export type Digest = {
  week: string;
  builtAt: number;
  capacity: number;
  unitsPlanned: number;
  cards: DigestCard[];
  upNext: DigestCard[];
  slots: Slot[];
  /** Short text for the notification. */
  headline: string;
};

export type DigestOptions = { week: string; builtAt: number; capacity: number; startDayIndex: number; readingDays: number };

export function buildDigest(finds: FindInput[], o: DigestOptions): Digest {
  const plan = planWeek(finds.map((f) => ({ series: f.series, score: f.score, order: f.order })), o.capacity, o.startDayIndex, o.readingDays);
  const mk = (f: FindInput, bucket: 'week' | 'next'): DigestCard => {
    const { series, ...rest } = f;
    const mine = plan.slots.filter((s) => s.forId === series.id);
    return { ...rest, seriesId: series.id, title: series.title, units: series.units, plan: mine.map(describeSlot), bucket };
  };
  const byScore = (a: FindInput, b: FindInput) => b.score - a.score || a.series.title.localeCompare(b.series.title);
  const cards = finds.filter((f) => plan.thisWeek.includes(f.series.id)).sort(byScore).map((f) => mk(f, 'week'));
  const upNext = finds.filter((f) => plan.upNext.includes(f.series.id)).sort(byScore).map((f) => mk(f, 'next'));
  const lines = plan.slots.slice(0, 3).map(describeSlot);
  const headline = lines.length ? lines.join(' · ') : upNext.length ? `${upNext.length} find${upNext.length === 1 ? '' : 's'} waiting for room in your week.` : 'Nothing new this week.';
  return { week: o.week, builtAt: o.builtAt, capacity: o.capacity, unitsPlanned: plan.unitsPlanned, cards, upNext, slots: plan.slots, headline };
}

/** The ISO date (YYYY-MM-DD) of the day the digest is for. */
export const weekKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Next occurrence of `weekday` (0 = Sunday) at hour:minute, strictly after `now`. */
export function nextDigestTime(now: Date, weekday: number, hour: number, minute: number): Date {
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  t.setDate(t.getDate() + ((weekday - now.getDay() + 7) % 7));
  if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 7);
  return t;
}
