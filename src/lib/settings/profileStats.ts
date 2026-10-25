// What the Profile page says about the reader — all derived from their real
// taste profile and reading history, never hard-coded. Pure and tested.
import type { TasteProfile } from '../types/engine-io';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

export interface TasteBar { label: string; value: number }

/** The genres the reader has genuinely leaned toward, strongest first. Only
 *  positive, actually-observed affinities appear; nothing is invented. */
export function tasteBars(p: TasteProfile, limit = 4): TasteBar[] {
  return Object.entries(p.affinities.genre)
    .filter(([, a]) => a.seen > 0 && a.score > 0)
    .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([genre, a]) => ({ label: cap(genre), value: Math.min(1, Math.max(0, a.score)) }));
}

export interface Persona { title: string; copy: string }

const NEW_READER_THRESHOLD = 3;

export function personaFor(p: TasteProfile, finishedCount: number): Persona {
  if (finishedCount < NEW_READER_THRESHOLD) {
    return { title: 'The Newcomer', copy: 'Finish and rate a few comics and ComicPill will start to learn what you love.' };
  }
  const top = tasteBars(p, 1)[0]?.label.toLowerCase();
  const leaning = top ? ` You keep coming back to ${top}.` : '';
  if (p.adventurousness >= 0.62) return { title: 'The Explorer', copy: `You keep making room for something new.${leaning}` };
  if (p.adventurousness <= 0.38) return { title: 'The Loyalist', copy: `You know what you love and go deep on it.${leaning}` };
  return { title: 'The Balanced Reader', copy: `You mix the familiar with the occasional surprise.${leaning}` };
}

export interface MonthProgress { count: number; goal: number; ratio: number; message: string }

/** Books finished in the calendar month of `now`, against the monthly goal. */
export function monthProgress(finishedAt: (string | null)[], goal: number, now: Date): MonthProgress {
  const count = finishedAt.filter((iso) => {
    if (!iso) return false;
    const d = new Date(iso);
    return !Number.isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const safeGoal = Math.max(1, goal);
  return {
    count, goal: safeGoal, ratio: Math.min(1, count / safeGoal),
    message: count >= safeGoal ? 'Goal reached — nice.' : `${safeGoal - count} to go this month.`,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today", "Yesterday", "12 Sep", or "12 Sep 2025" for another year. */
export function formatDay(iso: string | null, now: Date): string {
  if (!iso) return 'Recently';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Recently';
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

const RATING_WORD: Record<number, string> = { 1: 'Not for me', 2: 'Meh', 3: 'Good', 4: 'Great', 5: 'Loved it' };
export const ratingWord = (r: number | null) => (r ? RATING_WORD[r] ?? null : null);

export interface HistoryRow { workId: string; title: string; status: 'done' | 'reading'; rating: number | null; finishedAt: string | null; updatedAt: string }

/** Most recent first; a finished book sorts by when it was finished. */
export function sortHistory(rows: HistoryRow[]): HistoryRow[] {
  const when = (r: HistoryRow) => r.finishedAt ?? r.updatedAt;
  return [...rows].sort((a, b) => (when(a) < when(b) ? 1 : when(a) > when(b) ? -1 : a.title.localeCompare(b.title)));
}

export function historyLine(r: HistoryRow, now: Date): string {
  if (r.status === 'reading') return `Reading since ${formatDay(r.updatedAt, now)}`;
  const word = ratingWord(r.rating);
  return `Finished ${formatDay(r.finishedAt ?? r.updatedAt, now).replace(/^Recently$/, 'recently')}${word ? ` · ${word}` : ''}`;
}
