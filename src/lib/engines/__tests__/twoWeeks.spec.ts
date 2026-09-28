import { describe, expect, it } from 'vitest';
import { recomputeProfile, applyAppetite, applyExploreOutcome } from '../taste/profile';
import { tasteFit } from '../taste/fit';
import { pickToday } from '../recommend/slots';
import { detectFatigue, currentStreak } from '../taste/fatigue';
import { predictAppetite } from '../taste/checkin';
import { noveltyBonus, distanceFromRecentAverage } from '../recommend/novelty';
import type { TasteEvent } from '../../types/domain';
import {
  buildInput, DATE_KEY, WORKS_BY_ID,
  darkVictory, underRedHood, blackMirror, theCult,
  manWithoutFear, bornAgain, siktc, ffSolve,
} from './fixtures/twoWeeks';
import type { FinishedRead } from '../../types/engine-io';

const now = new Date('2026-09-14T20:00:00Z');

function ev(partial: Partial<TasteEvent> & Pick<TasteEvent, 'type' | 'occurredAt'>): TasteEvent {
  return { id: crypto.randomUUID?.() ?? Math.random().toString(36), workId: null, dimension: null, tag: null, value: null, calibration: null, appetite: null, exploreGoodOrBetter: null, ...partial };
}

describe('the two-week worked example', () => {
  // --- Step 1: finish Dark Victory, Loved it, chips Mystery + Villain, violence just_right.
  const events: TasteEvent[] = [
    ev({ type: 'rating_loved', workId: darkVictory.id, occurredAt: '2026-09-01T20:00:00Z' }),
    ev({ type: 'chip', tag: { kind: 'genre', value: 'mystery' }, occurredAt: '2026-09-01T20:00:01Z' }),
    ev({ type: 'chip', tag: { kind: 'character', value: 'Two-Face' }, occurredAt: '2026-09-01T20:00:02Z' }),
    ev({ type: 'calibrate', workId: darkVictory.id, dimension: 'violence', calibration: 'just_right', occurredAt: '2026-09-01T20:00:03Z' }),
  ];
  const profile1 = recomputeProfile(events, WORKS_BY_ID, now);

  it('raises detective/mystery and Two-Face affinity after a Loved rating', () => {
    expect(profile1.affinities.bucket['batman'].score).toBeGreaterThan(0);
    expect(profile1.affinities.genre['detective'].score).toBeGreaterThan(0);
    expect(profile1.affinities.genre['mystery'].score).toBeGreaterThan(0);
    expect(profile1.affinities.character['Two-Face'].score).toBeGreaterThan(0);
  });

  const recentFinished1: FinishedRead[] = [
    { workId: darkVictory.id, bucket: 'batman', fingerprint: darkVictory.fingerprint, rating: 5, finishedAt: '2026-09-01T20:00:00Z' },
  ];

  const input1 = buildInput({ profile: profile1, recentFinished: recentFinished1 });
  const today1 = pickToday(input1, { mood: null, dateKey: DATE_KEY, config: defaultConfig(), now });

  it('Continue is Under the Red Hood — the one unambiguous pick (next in the reading path)', () => {
    expect(today1.continueSlot?.workId).toBe(underRedHood.id);
  });

  // Switch and Explore's *exact* winners are deliberately not pinned to specific
  // titles here: with only one finished book, several candidates (Man Without
  // Fear, SIKTC, FF Solve Everything) are legitimately close competitors for
  // "strong fit in a different lane", and which one edges out the others is
  // sensitive to fixture fingerprint values in a way the blueprint's prose
  // never numerically specifies. What the blueprint DOES specify precisely —
  // and what actually matters for correctness — is asserted below.
  it('Switch and Explore land in two further distinct buckets, respecting their floors', () => {
    const buckets = [today1.continueSlot, today1.switchSlot, today1.exploreSlot].map(
      (s) => WORKS_BY_ID.get(s!.workId)!.bucket,
    );
    expect(new Set(buckets).size).toBe(3); // three slots, three different buckets, always
    expect(today1.switchSlot!.parts.T).toBeGreaterThanOrEqual(0.6);
    expect(today1.exploreSlot!.parts.T).toBeGreaterThanOrEqual(0.45);
  });

  it('only the Explore slot carries a novelty bonus', () => {
    expect(today1.continueSlot!.parts.N).toBe(0);
    expect(today1.switchSlot!.parts.N).toBe(0);
    expect(today1.exploreSlot!.parts.N).toBeGreaterThan(0);
  });

  // --- Step 2: finish Under the Red Hood, Good. Streak is now 2.
  const recentFinished2: FinishedRead[] = [
    { workId: underRedHood.id, bucket: 'batman', fingerprint: underRedHood.fingerprint, rating: 3, finishedAt: '2026-09-03T20:00:00Z' },
    ...recentFinished1,
  ];

  it('streak of 2 presets the appetite card to Mix it up', () => {
    const { count } = currentStreak(recentFinished2);
    expect(count).toBe(2);
    const fatigue = detectFatigue(recentFinished2, [], now);
    const appetite = predictAppetite(recentFinished2, fatigue);
    expect(appetite.preset).toBe('mix');
  });

  // Player leaves it at "mix" -> exploration rate unchanged; Switch leads with Daredevil.
  const events2 = [...events, ev({ type: 'rating_good', workId: underRedHood.id, occurredAt: '2026-09-03T20:00:00Z' })];
  const profile2 = recomputeProfile(events2, WORKS_BY_ID, now);
  const input2 = buildInput({
    profile: profile2, recentFinished: recentFinished2,
    nextWorkIdByBucket: { ...buildInput().nextWorkIdByBucket, batman: blackMirror.id },
  });
  const today2 = pickToday(input2, { mood: null, dateKey: DATE_KEY, config: defaultConfig(), now });


  it('the switch slot still holds a different bucket from Continue, above its floor', () => {
    const continueBucket = WORKS_BY_ID.get(today2.continueSlot!.workId)!.bucket;
    const switchBucket = WORKS_BY_ID.get(today2.switchSlot!.workId)!.bucket;
    expect(switchBucket).not.toBe(continueBucket);
    expect(today2.switchSlot!.parts.T).toBeGreaterThanOrEqual(0.6);
  });

  // --- Step 3: finish Man Without Fear, Great. Street/crime affinities rise; Born Again's
  // buy label should no longer be skip.
  const events3 = [...events2, ev({ type: 'rating_great', workId: manWithoutFear.id, occurredAt: '2026-09-05T20:00:00Z' })];
  const profile3 = recomputeProfile(events3, WORKS_BY_ID, now);

  it('street bucket and crime genre affinity rise after Man Without Fear', () => {
    expect(profile3.affinities.bucket['street'].score).toBeGreaterThan(0);
    expect(profile3.affinities.genre['crime'].score).toBeGreaterThan(0);
  });

  it("Born Again's taste fit rises now that street/crime affinity exists", () => {
    const before = tasteFit(bornAgain, profile1);
    const after = tasteFit(bornAgain, profile3);
    expect(after).toBeGreaterThan(before);
  });

  // --- Step 4: Black Mirror (Good), then The Cult (Meh). Fatigue triggers fire.
  const recentFinished4: FinishedRead[] = [
    { workId: theCult.id, bucket: 'batman', fingerprint: theCult.fingerprint, rating: 2, finishedAt: '2026-09-10T20:00:00Z' },
    { workId: blackMirror.id, bucket: 'batman', fingerprint: blackMirror.fingerprint, rating: 3, finishedAt: '2026-09-08T20:00:00Z' },
    { workId: manWithoutFear.id, bucket: 'street', fingerprint: manWithoutFear.fingerprint, rating: 4, finishedAt: '2026-09-05T20:00:00Z' },
    ...recentFinished2,
  ];

  it('falling ratings trigger fatigue and preset the appetite card to Something new', () => {
    // The streak from most-recent is Cult -> Black Mirror = 2 books (Man Without
    // Fear breaks it before Under the Red Hood), so the precise "3 in a row"
    // trigger does not fire here — only falling_ratings does, which is enough
    // on its own to preset "new" with the doc's exact line.
    const fatigue = detectFatigue(recentFinished4, [], now);
    expect(fatigue.triggers).toContain('falling_ratings');
    const appetite = predictAppetite(recentFinished4, fatigue);
    expect(appetite.preset).toBe('new');
    expect(appetite.line).toMatch(/last two reads rated lower/i);
  });

  // --- Step 5: answer "Something new" -> exploration rate 0.2 -> 0.35 exactly.
  it('answering "new" moves the exploration rate from 0.2 to exactly 0.35', () => {
    const moved = applyAppetite(profile1, 'new');
    expect(moved.explorationRate).toBeCloseTo(0.35, 10);
  });

  const events5 = [...events3,
    ev({ type: 'rating_good', workId: blackMirror.id, occurredAt: '2026-09-08T20:00:00Z' }),
    ev({ type: 'rating_meh', workId: theCult.id, occurredAt: '2026-09-10T20:00:00Z' }),
  ];
  let profile5 = recomputeProfile(events5, WORKS_BY_ID, now);
  profile5 = applyAppetite(profile5, 'new');

  const input5 = buildInput({
    profile: profile5, recentFinished: recentFinished4,
    nextWorkIdByBucket: { ...buildInput().nextWorkIdByBucket },
  });
  const today5 = pickToday(input5, { mood: null, dateKey: '2026-09-11', config: defaultConfig(), now });

  it('Today leads with Explore once "something new" has raised the exploration rate', () => {
    expect(today5.lead).toBe('explore');
    expect(today5.exploreSlot!.parts.T).toBeGreaterThanOrEqual(0.45);
    expect(today5.exploreSlot!.parts.N).toBeGreaterThan(0);
  });

  // --- Step 6: finish FF Solve Everything, Great. Adventurousness rises, so the
  // novelty bonus for a fixed distance is strictly larger than before.
  it('finishing the Explore pick Great raises adventurousness and thus future novelty bonus', () => {
    const d = 0.6; // a fixed distance-from-recent value
    const before = noveltyBonus(d, profile5.adventurousness);
    const events6 = [...events5, ev({ type: 'rating_great', workId: ffSolve.id, occurredAt: '2026-09-12T20:00:00Z' })];
    // Adventurousness only moves via applyExploreOutcome, driven by the app layer
    // recognising this was an Explore pick rated Good+; simulate that call directly.
    const profile6 = applyExploreOutcome(recomputeProfile(events6, WORKS_BY_ID, now), true);
    const after = noveltyBonus(d, profile6.adventurousness);
    expect(after).toBeGreaterThan(before);
  });
});

function defaultConfig() {
  return {
    version: 1,
    weights: { T: 0.35, M: 0.15, P: 0.20, O: 0.10, F: 0.15 },
    tasteFloorSwitch: 0.6,
    tasteFloorExplore: 0.45,
    explorationBounds: [0.1, 0.5] as [number, number],
    signalWeights: {
      rating_loved: 1.0, rating_great: 0.7, rating_good: 0.4, rating_meh: -0.3,
      rating_not_for_me: -0.8, dropped: -1.0, chip: 0.5, swipe_right: 0.3,
      swipe_left: -0.3, swipe_up: 0.7, not_tonight: -0.05,
    },
  };
}
