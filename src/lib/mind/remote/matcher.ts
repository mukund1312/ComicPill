// Match what a screenshot said to a real series. Pure: ranks candidates and says whether to trust the
// best one, ask the reader to choose between two close ones, or give up and keep an unverified card.
import { titleScore } from '../../scan/match';
import type { ExternalSeries, Medium } from './types';

export type Extracted = { title: string; creators: string[]; medium: Medium };
export type Ranked = { series: ExternalSeries; score: number };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function creatorBonus(wanted: string[], got: string[]): number {
  if (!wanted.length || !got.length) return 0;
  const g = got.map(norm);
  const hit = wanted.map(norm).some((w) => w && g.some((x) => x.includes(w) || w.includes(x)));
  return hit ? 0.1 : 0;
}

export function rankCandidates(x: Extracted, candidates: ExternalSeries[]): Ranked[] {
  return candidates
    .map((series) => {
      const best = Math.max(...[series.title, ...series.altTitles].map((t) => titleScore(x.title, null, t)));
      const mediumClash = x.medium !== 'unknown' && series.medium !== 'unknown' && x.medium !== series.medium && !(x.medium === 'graphic_novel' && series.medium === 'comic');
      const score = Math.max(0, Math.min(1, best + creatorBonus(x.creators, series.creators) - (mediumClash ? 0.15 : 0)));
      return { series, score };
    })
    .sort((a, b) => b.score - a.score);
}

export type MatchDecision =
  | { kind: 'confident'; best: Ranked }
  | { kind: 'ambiguous'; options: Ranked[] }
  | { kind: 'none' };

export const CONFIDENT = 0.85;
export const PLAUSIBLE = 0.6;
const CLOSE = 0.12;

export function decideMatch(ranked: Ranked[]): MatchDecision {
  const [a, b] = ranked;
  if (!a || a.score < PLAUSIBLE) return { kind: 'none' };
  if (b && b.score >= PLAUSIBLE && a.score - b.score < CLOSE) return { kind: 'ambiguous', options: ranked.filter((r) => r.score >= PLAUSIBLE && a.score - r.score < CLOSE).slice(0, 3) };
  if (a.score >= CONFIDENT) return { kind: 'confident', best: a };
  // plausible but not certain, and nothing close behind: ask rather than guess silently
  return { kind: 'ambiguous', options: [a] };
}
