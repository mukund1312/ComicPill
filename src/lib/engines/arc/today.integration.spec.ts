// Runs the REAL pickToday engine: does an active journey actually change
// what Today recommends? (The helper's own unit tests only cover the plumbing.)
import { describe, expect, it } from 'vitest';
import { pickToday } from '../recommend/slots';
import { applyArcNextSteps } from './today';
import { buildInput, DATE_KEY, WORKS_BY_ID, blackMirror, underRedHood } from '../__tests__/fixtures/twoWeeks';
import { DEFAULT_ENGINE_CONFIG } from '../../types/engine-io';
import type { nextSteps } from './membership';

const now = new Date('2026-09-14T20:00:00Z');
const opts = { mood: null, dateKey: DATE_KEY, config: DEFAULT_ENGINE_CONFIG, now };
type Step = ReturnType<typeof nextSteps>[number];
const step = (workId: string, accessible = true): Step => ({
  arcId: 'a', arcTitle: 'Batman: From Year One to Legacy', workId, own: accessible ? 'physical' : 'none', accessible,
  chapterTitle: 'The First Robin', milestoneTitle: 'm', why: 'w', percentComplete: 10,
});
const bucketByWork = new Map([...WORKS_BY_ID.values()].map((w) => [w.id, w.bucket]));

describe('Today follows an active journey', () => {
  it('baseline: without a journey the Batman lane continues with Under the Red Hood', () => {
    expect(pickToday(buildInput(), opts).continueSlot?.workId).toBe(underRedHood.id);
  });

  it('with a journey whose next step is Black Mirror, Continue becomes Black Mirror', () => {
    const base = buildInput();
    const lanes = applyArcNextSteps(base.pathStatus, base.nextWorkIdByBucket, bucketByWork, [step(blackMirror.id)]);
    const today = pickToday(buildInput(lanes), opts);
    expect(today.continueSlot?.workId).toBe(blackMirror.id);
  });

  it('a journey step the reader does not have leaves Today exactly as it was', () => {
    const base = buildInput();
    const lanes = applyArcNextSteps(base.pathStatus, base.nextWorkIdByBucket, bucketByWork, [step(blackMirror.id, false)]);
    expect(pickToday(buildInput(lanes), opts)).toEqual(pickToday(buildInput(), opts));
  });
});
