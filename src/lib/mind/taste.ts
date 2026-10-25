// Glue between SQLite rows and the pure taste/verdict engines.
import { buildProfile, calibrate, reasonsFor, scoreSeries, scoreToRating, type Calibration, type Confidence, type RatingEvent, type ScoreResult, type Weights } from './engine/tasteScorer';
import { applyOverrides, decideVerdict, type Thresholds, type Verdict, type VerdictInput, type VerdictOverrides } from './engine/verdictRules';
import type { SeriesRow } from './model';
import { getVerdictOverrides, listRatings } from './queries';
import { budgetRemaining, type MindSettings } from './settings';

export function ratingEvents(): RatingEvent[] {
  return listRatings().map((r): RatingEvent => (r.overrideScore !== null
    ? { tags: r.series.tags, rating: scoreToRating(r.overrideScore), weight: 2 } // "I disagree" counts double
    : { tags: r.series.tags, rating: r.rating, dropped: r.dropped }));
}

export type ScoredSeries = { score: number; confidence: Confidence; reasons: string[]; evidence: number; result: ScoreResult | null; overridden: boolean; known: boolean };

export function makeScorer(weights: Weights) {
  const events = ratingEvents();
  const profile = buildProfile(events);
  const overrides = new Map(listRatings().filter((r) => r.overrideScore !== null).map((r) => [r.seriesId, r.overrideScore as number]));
  return {
    events,
    calibration: (): Calibration => calibrate(events, weights),
    score(series: SeriesRow): ScoredSeries {
      const result = scoreSeries(series.tags, profile, events, weights);
      const o = overrides.get(series.id);
      if (o !== undefined) return { score: o, confidence: 'high', reasons: ['You set this score yourself.'], evidence: result.evidence, result, overridden: true, known: true };
      const known = result.breakdown.some((b) => b.known);
      return { score: result.score, confidence: result.confidence, reasons: reasonsFor(result), evidence: result.evidence, result, overridden: false, known };
    },
  };
}

/** Volumes in the run, for the verdict rules; Comic Vine counts issues, roughly six to a volume. */
export const volumesOf = (s: SeriesRow): number => (s.unitName === 'issues' ? Math.ceil(s.units / 6) : s.units);

export function verdictInputFor(s: SeriesRow, scored: Pick<ScoredSeries, 'score' | 'confidence'>, settings: MindSettings, now: Date = new Date()): VerdictInput {
  const base: VerdictInput = {
    score: scored.score, confidence: scored.confidence, artDriven: s.artDriven, runStatus: s.runStatus, volumes: volumesOf(s), print: s.printStatus,
    priceRising: s.priceRising, budgetRemaining: budgetRemaining(settings, now), typicalPrice: settings.typicalPrice,
  };
  return applyOverrides(base, getVerdictOverrides(s.id) as VerdictOverrides | undefined);
}

export function verdictFor(s: SeriesRow, scored: Pick<ScoredSeries, 'score' | 'confidence'>, settings: MindSettings, thresholds: Thresholds = settings.thresholds, now: Date = new Date()): Verdict {
  return decideVerdict(verdictInputFor(s, scored, settings, now), thresholds);
}
