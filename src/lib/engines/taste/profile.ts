import type { Dim, SignalKind, TasteEvent } from '../../types/domain';
import { DIMENSIONS } from '../../types/domain';
import type { Affinity, ScorableWork, SweetSpots, TasteProfile } from '../../types/engine-io';
import { DEFAULT_ENGINE_CONFIG } from '../../types/engine-io';
import { updateAffinity } from './affinity';

export const ENGINE_VERSION = 1;
const HALF_LIFE_DAYS = 182; // ~6 months

export function emptySweetSpots(): SweetSpots {
  const spots = {} as SweetSpots;
  for (const dim of DIMENSIONS) spots[dim] = { value: 0.5, confidence: 0 };
  return spots;
}

export function emptyProfile(): TasteProfile {
  return {
    engineVersion: ENGINE_VERSION,
    sweetSpots: emptySweetSpots(),
    affinities: { genre: {}, creator: {}, character: {}, bucket: {} },
    explorationRate: 0.2,
    adventurousness: 0.5,
    streak: { bucket: null, count: 0 },
    updatedAt: new Date(0).toISOString(),
  };
}

/** Signals older than 182 days count half. */
export function decayWeight(occurredAt: Date, now: Date): 1 | 0.5 {
  const days = (now.getTime() - occurredAt.getTime()) / (24 * 60 * 60 * 1000);
  return days > HALF_LIFE_DAYS ? 0.5 : 1;
}

function bumpAffinity(bucket: Record<string, Affinity>, key: string, weight: number): void {
  const cur = bucket[key] ?? { score: 0, seen: 0 };
  bucket[key] = { score: updateAffinity(cur.score, cur.seen, weight), seen: cur.seen + 1 };
}

export function moveSweetSpot(
  spot: SweetSpots[Dim],
  bookValue: number,
  answer: 'too_little' | 'too_much' | 'just_right',
): SweetSpots[Dim] {
  let target: number;
  if (answer === 'just_right') target = bookValue;
  else if (answer === 'too_much') target = bookValue - 0.15;
  else target = bookValue + 0.15;
  target = Math.max(0, Math.min(1, target));
  // Move a third of the way to the target — enough to matter, not enough for one
  // answer to whiplash the profile.
  const value = spot.value + (target - spot.value) / 3;
  const confidence = Math.min(1, spot.confidence + 0.1);
  return { value, confidence };
}

export function applyAppetite(
  profile: TasteProfile,
  answer: 'more' | 'mix' | 'new',
): TasteProfile {
  const delta = answer === 'more' ? -0.05 : answer === 'new' ? 0.15 : 0;
  const [lo, hi] = DEFAULT_ENGINE_CONFIG.explorationBounds;
  return {
    ...profile,
    explorationRate: Math.max(lo, Math.min(hi, profile.explorationRate + delta)),
  };
}

export function applyExploreOutcome(
  profile: TasteProfile,
  ratingGoodOrBetter: boolean,
): TasteProfile {
  const advDelta = ratingGoodOrBetter ? 0.1 : -0.1;
  const rateDelta = ratingGoodOrBetter ? 0.05 : -0.05;
  const [lo, hi] = DEFAULT_ENGINE_CONFIG.explorationBounds;
  return {
    ...profile,
    adventurousness: Math.max(0, Math.min(1, profile.adventurousness + advDelta)),
    explorationRate: Math.max(lo, Math.min(hi, profile.explorationRate + rateDelta)),
  };
}

interface ApplySignalCtx {
  work: ScorableWork | undefined;
  now: Date;
}

/** Apply one event to a profile, returning a new profile. Pure. */
export function applySignal(
  profile: TasteProfile,
  event: TasteEvent,
  ctx: ApplySignalCtx,
): TasteProfile {
  const decay = decayWeight(new Date(event.occurredAt), ctx.now);
  const next: TasteProfile = {
    ...profile,
    affinities: {
      genre: { ...profile.affinities.genre },
      creator: { ...profile.affinities.creator },
      character: { ...profile.affinities.character },
      bucket: { ...profile.affinities.bucket },
    },
    sweetSpots: { ...profile.sweetSpots },
  };

  const baseWeight = DEFAULT_ENGINE_CONFIG.signalWeights[event.type as SignalKind] ?? 0;
  const work = ctx.work;

  const ratingSignals: SignalKind[] = [
    'rating_loved', 'rating_great', 'rating_good', 'rating_meh', 'rating_not_for_me', 'dropped',
  ];

  if (ratingSignals.includes(event.type) && work) {
    const w = baseWeight * decay;
    for (const g of work.genres) bumpAffinity(next.affinities.genre, g, w);
    for (const c of work.creators) bumpAffinity(next.affinities.creator, c, w);
    for (const c of work.characters) bumpAffinity(next.affinities.character, c, w);
    bumpAffinity(next.affinities.bucket, work.bucket, w);
  } else if (event.type === 'chip' && event.tag && event.tag.kind !== 'note') {
    // Chips add ±0.5 extra weight on that specific dimension/tag only.
    // 'note' (free-text reflection) has no affinity table to bump — it's
    // qualitative commentary, stored for future reading, not scoring input.
    const w = baseWeight * decay;
    const table = next.affinities[event.tag.kind];
    bumpAffinity(table, event.tag.value, w);
  } else if ((event.type === 'swipe_right' || event.type === 'swipe_left') && work) {
    const w = baseWeight * decay;
    for (const g of work.genres) bumpAffinity(next.affinities.genre, g, w);
    bumpAffinity(next.affinities.bucket, work.bucket, w);
  } else if (event.type === 'calibrate' && work && event.dimension && event.calibration && work.fingerprint) {
    const bookValue = work.fingerprint[event.dimension];
    next.sweetSpots[event.dimension] = moveSweetSpot(profile.sweetSpots[event.dimension], bookValue, event.calibration);
  } else if (event.type === 'appetite' && event.appetite) {
    const moved = applyAppetite(next, event.appetite);
    next.explorationRate = moved.explorationRate;
  } else if (event.type === 'explore_outcome' && event.exploreGoodOrBetter != null) {
    const moved = applyExploreOutcome(next, event.exploreGoodOrBetter);
    next.adventurousness = moved.adventurousness;
    next.explorationRate = moved.explorationRate;
  } else if (event.type === 'swipe_up' && work && event.value != null) {
    // event.value is a 1..3 mini-rating; weight = rating * 0.7, mapped onto -1..1.
    const normalized = (event.value - 2) / 1; // 1->-1, 2->0, 3->1
    const w = normalized * 0.7 * decay;
    for (const g of work.genres) bumpAffinity(next.affinities.genre, g, w);
    bumpAffinity(next.affinities.bucket, work.bucket, w);
  }
  // 'not_tonight' deliberately touches nothing but is recorded in the event log
  // for the fatigue detector; it must not move the long-term profile beyond the
  // -0.05 mood nudge, which the recommend engine applies directly to score, not here.

  next.updatedAt = ctx.now.toISOString();
  return next;
}

/** The replay entrypoint: profile = f(event log). Always recomputed, never patched
 *  incrementally, so a changed weight or a bumped ENGINE_VERSION means every device
 *  gets a fresh, correct profile just by replaying the immutable log. */
export function recomputeProfile(
  events: TasteEvent[],
  works: ReadonlyMap<string, ScorableWork>,
  now: Date,
): TasteProfile {
  const sorted = [...events].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );
  let profile = emptyProfile();
  for (const event of sorted) {
    profile = applySignal(profile, event, { work: event.workId ? works.get(event.workId) : undefined, now });
  }
  return profile;
}
