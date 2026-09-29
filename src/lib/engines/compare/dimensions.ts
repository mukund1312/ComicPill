// The 10 comparison dimensions (product brief: "Compare across 10
// meaningful dimensions"). Every dimension is a pure function of a
// ScorableWork + the reader's existing profile/state — nothing here touches
// the db or an LLM. Compare's job is to give a defensible, explainable
// ranking; a later pass can make the "why" prose friendlier without ever
// changing what these numbers mean.
import { DIMENSIONS } from '../../types/domain';
import type { Dim } from '../../types/domain';
import { fatiguePenalty } from '../taste/fatigue';
import { fingerprintCloseness } from '../taste/fit';
import { MOOD_GENRES } from '../recommend/score';
import type { FinishedRead, ScorableWork, TasteProfile } from '../../types/engine-io';

export type CompareDimensionKey =
  | 'readiness' | 'tasteMatch' | 'moodMatch' | 'storyFit' | 'artwork'
  | 'characterInterest' | 'commitment' | 'availability' | 'pathRelevance' | 'variety';

export interface CompareDimension {
  key: CompareDimensionKey;
  score: number; // 0..1, always populated — used for ranking
  label: string; // human vocabulary for display, e.g. "Strong", "Short", "Physical"
}

/** What Compare needs to know about ONE candidate that isn't already on
 *  ScorableWork — the caller (query layer) computes these from the graph/
 *  path engines that already exist, so this stays a pure aggregation step
 *  rather than reimplementing readiness or path logic. */
export interface CompareWorkInput {
  work: ScorableWork;
  isReady: boolean; // no unread required prerequisite
  blockedByTitles: string[]; // for the "why" text when not ready
  pathStanding: 'reading' | 'unstarted' | 'none'; // is this next-up in an active path?
}

export interface CompareContext {
  profile: TasteProfile;
  mood: string | null; // a mood id from Today, e.g. 'dark' — see score.ts's MOOD_GENRES
  recentFinished: FinishedRead[]; // most recent first, same shape Today uses
}

// Excellent/Strong/Moderate/Weak — the brief is explicit: no fake precision
// like "93.72". These thresholds mirror the qualitative bands already used
// informally elsewhere in the app (e.g. PurchaseBadge's tiering).
export function qualityLabel(score: number): 'Excellent' | 'Strong' | 'Moderate' | 'Weak' {
  if (score >= 0.8) return 'Excellent';
  if (score >= 0.6) return 'Strong';
  if (score >= 0.4) return 'Moderate';
  return 'Weak';
}

/** Same weighted closeness-to-sweet-spot math as fingerprintCloseness, but
 *  scoped to a subset of dimensions — lets "story fit" and "artwork" be
 *  genuinely different numbers instead of both just being the same overall
 *  taste fit restated twice. */
function closenessOn(fingerprint: Record<Dim, number>, profile: TasteProfile, dims: Dim[]): number {
  const BASELINE_WEIGHT = 0.05;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const dim of dims) {
    const spot = profile.sweetSpots[dim];
    if (spot.confidence > 0) {
      const distance = Math.abs(fingerprint[dim] - spot.value);
      weightedSum += (1 - distance) * spot.confidence;
      weightTotal += spot.confidence;
    }
    weightedSum += 0.5 * BASELINE_WEIGHT;
    weightTotal += BASELINE_WEIGHT;
  }
  return weightedSum / weightTotal;
}

function avgAffinity(values: Array<{ score: number; seen: number } | undefined>): number | null {
  const seen = values.filter((v): v is { score: number; seen: number } => !!v && v.seen > 0);
  if (!seen.length) return null;
  const mean = seen.reduce((s, v) => s + v.score, 0) / seen.length;
  return (mean + 1) / 2; // -1..1 -> 0..1
}

function readinessDimension(input: CompareWorkInput): CompareDimension {
  return { key: 'readiness', score: input.isReady ? 1 : 0.15, label: input.isReady ? 'Ready now' : 'Missing context' };
}

function tasteMatchDimension(work: ScorableWork, profile: TasteProfile): CompareDimension {
  const closeness = work.fingerprint ? closenessOn(work.fingerprint, profile, DIMENSIONS) : 0.5;
  const tagAffinity = avgAffinity([
    ...work.genres.map((g) => profile.affinities.genre[g]),
    ...work.creators.map((c) => profile.affinities.creator[c]),
    ...work.characters.map((c) => profile.affinities.character[c]),
    profile.affinities.bucket[work.bucket],
  ]);
  const score = tagAffinity === null ? closeness : (closeness + tagAffinity) / 2;
  return { key: 'tasteMatch', score, label: qualityLabel(score) };
}

/** No mood selected: neutral, not a penalty — Compare shouldn't pretend a
 *  reader who didn't pick a mood has a bad mood match. */
function moodMatchDimension(work: ScorableWork, mood: string | null): CompareDimension {
  if (!mood) return { key: 'moodMatch', score: 0.5, label: 'No mood set' };
  const moodGenres = MOOD_GENRES[mood] ?? [];
  const matches = work.genres.some((g) => moodGenres.includes(g)) || work.bucket === mood;
  return { key: 'moodMatch', score: matches ? 1 : 0.3, label: matches ? 'Matches your mood' : 'Off mood' };
}

function storyFitDimension(work: ScorableWork, profile: TasteProfile): CompareDimension {
  const score = work.fingerprint ? closenessOn(work.fingerprint, profile, ['tone', 'complexity', 'mystery', 'pace']) : 0.5;
  return { key: 'storyFit', score, label: qualityLabel(score) };
}

function artworkDimension(work: ScorableWork, profile: TasteProfile): CompareDimension {
  const score = work.fingerprint ? closenessOn(work.fingerprint, profile, ['artForward']) : 0.5;
  return { key: 'artwork', score, label: qualityLabel(score) };
}

function characterInterestDimension(work: ScorableWork, profile: TasteProfile): CompareDimension {
  const affinity = avgAffinity([
    ...work.characters.map((c) => profile.affinities.character[c]),
    ...work.creators.map((c) => profile.affinities.creator[c]),
  ]);
  const score = affinity ?? 0.5;
  return { key: 'characterInterest', score, label: qualityLabel(score) };
}

/** Lower commitment scores slightly higher — this is "what should I read
 *  RIGHT NOW", not a judgement that long series are worse. The label always
 *  states the actual length so a reader can weigh that tradeoff themselves. */
function commitmentDimension(work: ScorableWork): CompareDimension {
  const raw = work.fingerprint?.commitment ?? 0.5;
  const label = raw < 0.34 ? 'Short' : raw < 0.67 ? 'Medium' : 'Long';
  return { key: 'commitment', score: 1 - raw, label };
}

function availabilityDimension(work: ScorableWork): CompareDimension {
  const byOwn: Record<ScorableWork['own'], { score: number; label: string }> = {
    both: { score: 1, label: 'Physical & digital' },
    subscription: { score: 0.9, label: 'Subscription' },
    physical: { score: 0.85, label: 'Physical' },
    digital: { score: 0.85, label: 'Digital' },
    ordered: { score: 0.5, label: 'Ordered' },
    wishlist: { score: 0.35, label: 'Wishlist' },
    none: { score: 0.2, label: 'Not owned' },
  };
  const entry = byOwn[work.own];
  return { key: 'availability', score: entry.score, label: entry.label };
}

function pathRelevanceDimension(input: CompareWorkInput): CompareDimension {
  const score = input.pathStanding === 'reading' ? 1 : input.pathStanding === 'unstarted' ? 0.5 : 0;
  const label = input.pathStanding === 'reading' ? 'High' : input.pathStanding === 'unstarted' ? 'Medium' : 'Low';
  return { key: 'pathRelevance', score, label };
}

/** Reuses the same fatigue math Today uses for its F score — "have I read
 *  too much of this lately" shouldn't have a second, subtly different
 *  definition just because Compare asks the question from the other
 *  direction (variety = 1 - fatigue). */
function varietyDimension(work: ScorableWork, recentFinished: FinishedRead[]): CompareDimension {
  const last3 = recentFinished.slice(0, 3);
  let streak = 0;
  if (recentFinished.length) {
    const bucket = recentFinished[0].bucket;
    for (const r of recentFinished) { if (r.bucket !== bucket) break; streak += 1; }
  }
  const fatigue = fatiguePenalty(work, last3, streak);
  const score = 1 - fatigue;
  return { key: 'variety', score, label: qualityLabel(score) };
}

export function scoreDimensions(input: CompareWorkInput, ctx: CompareContext): CompareDimension[] {
  return [
    readinessDimension(input),
    tasteMatchDimension(input.work, ctx.profile),
    moodMatchDimension(input.work, ctx.mood),
    storyFitDimension(input.work, ctx.profile),
    artworkDimension(input.work, ctx.profile),
    characterInterestDimension(input.work, ctx.profile),
    commitmentDimension(input.work),
    availabilityDimension(input.work),
    pathRelevanceDimension(input),
    varietyDimension(input.work, ctx.recentFinished),
  ];
}
