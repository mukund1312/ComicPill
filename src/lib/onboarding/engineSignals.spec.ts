import { describe, expect, it } from 'vitest';
import { applySignal, emptyProfile, recomputeProfile } from '../engines/taste/profile';
import type { TasteEvent } from '../types/domain';

const NOW = new Date('2026-10-01T00:00:00Z');
const ev = (over: Partial<TasteEvent>): TasteEvent => ({
  id: 'e', workId: null, type: 'stated_like', dimension: null, tag: null, value: null, calibration: null, appetite: null,
  exploreGoodOrBetter: null, occurredAt: '2026-09-30T00:00:00Z', ...over,
});

describe('stated_like', () => {
  it('raises the affinity of what was named, in the right table', () => {
    const p = applySignal(emptyProfile(), ev({ tag: { kind: 'character', value: 'Batman' } }), { work: undefined, now: NOW });
    expect(p.affinities.character.Batman.score).toBeCloseTo(0.35); // 0.7 * (1/2)
    expect(p.affinities.character.Batman.seen).toBe(1);
    expect(p.affinities.genre.Batman).toBeUndefined();
  });
  it('is strong enough for one stated like to earn a taste reason (threshold 0.3), unlike a single chip', () => {
    const stated = applySignal(emptyProfile(), ev({ tag: { kind: 'genre', value: 'detective' } }), { work: undefined, now: NOW });
    const chip = applySignal(emptyProfile(), ev({ type: 'chip', tag: { kind: 'genre', value: 'detective' } }), { work: undefined, now: NOW });
    expect(stated.affinities.genre.detective.score).toBeGreaterThanOrEqual(0.3);
    expect(chip.affinities.genre.detective.score).toBeLessThan(0.3);
  });
  it('is gentle: it never reaches certainty from one statement', () => {
    const p = applySignal(emptyProfile(), ev({ tag: { kind: 'creator', value: 'Tim Sale' } }), { work: undefined, now: NOW });
    expect(p.affinities.creator['Tim Sale'].score).toBeLessThan(0.5);
  });
  it('ignores a note tag and a missing tag', () => {
    expect(applySignal(emptyProfile(), ev({ tag: { kind: 'note', value: 'x' } }), { work: undefined, now: NOW }).affinities).toEqual(emptyProfile().affinities);
    expect(applySignal(emptyProfile(), ev({ tag: null }), { work: undefined, now: NOW }).affinities).toEqual(emptyProfile().affinities);
  });
  it('later observed reading builds on it rather than replacing it', () => {
    const works = new Map();
    const stated = ev({ id: 's', tag: { kind: 'genre', value: 'detective' } });
    const p = recomputeProfile([stated, ev({ id: 'c', type: 'chip', tag: { kind: 'genre', value: 'detective' }, occurredAt: '2026-09-30T01:00:00Z' })], works, NOW);
    expect(p.affinities.genre.detective.score).toBeGreaterThan(0.35);
    expect(p.affinities.genre.detective.seen).toBe(2);
  });
});

describe('preference_seed', () => {
  const seed = (dimension: TasteEvent['dimension'], value: number, id = 's') => ev({ id, type: 'preference_seed', dimension, value });
  it('moves the sweet spot halfway toward the stated level, with modest confidence', () => {
    const p = applySignal(emptyProfile(), seed('tone', 0.9), { work: undefined, now: NOW });
    expect(p.sweetSpots.tone.value).toBeCloseTo(0.7); // 0.5 + (0.9 - 0.5) / 2
    expect(p.sweetSpots.tone.confidence).toBeCloseTo(0.1);
  });
  it('repeated statements strengthen it but confidence stays capped', () => {
    const events = Array.from({ length: 8 }, (_, i) => seed('tone', 0.9, `s${i}`));
    const p = recomputeProfile(events, new Map(), NOW);
    expect(p.sweetSpots.tone.value).toBeGreaterThan(0.85);
    expect(p.sweetSpots.tone.confidence).toBe(0.3);
  });
  it('clamps out-of-range values and ignores a missing dimension or value', () => {
    expect(applySignal(emptyProfile(), seed('pace', 7), { work: undefined, now: NOW }).sweetSpots.pace.value).toBeLessThanOrEqual(1);
    expect(applySignal(emptyProfile(), seed('pace', -3), { work: undefined, now: NOW }).sweetSpots.pace.value).toBeGreaterThanOrEqual(0);
    expect(applySignal(emptyProfile(), seed(null, 0.9), { work: undefined, now: NOW }).sweetSpots).toEqual(emptyProfile().sweetSpots);
    expect(applySignal(emptyProfile(), ev({ type: 'preference_seed', dimension: 'tone', value: null }), { work: undefined, now: NOW }).sweetSpots).toEqual(emptyProfile().sweetSpots);
  });
  it('does not disturb other dimensions', () => {
    const p = applySignal(emptyProfile(), seed('tone', 0.9), { work: undefined, now: NOW });
    expect(p.sweetSpots.violence).toEqual(emptyProfile().sweetSpots.violence);
  });
});
