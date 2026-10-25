import { describe, expect, it } from 'vitest';
import { applyArcNextSteps, journeyReason } from './today';
import type { nextSteps } from './membership';

type Step = ReturnType<typeof nextSteps>[number];
const step = (over: Partial<Step> = {}): Step => ({
  arcId: 'a', arcTitle: 'Batman: From Year One to Legacy', workId: 'dark-victory', own: 'physical', accessible: true,
  chapterTitle: 'The First Robin', milestoneTitle: 'Dick Grayson enters Bruce’s life', why: 'w', percentComplete: 15, ...over,
});
const buckets = new Map([['dark-victory', 'batman'], ['watchmen', 'dark']]);

describe('applyArcNextSteps', () => {
  it('turns the lane of an accessible next step into an actively-read lane pointing at it', () => {
    const r = applyArcNextSteps({ batman: 'not_in_path', dark: 'unstarted' }, { batman: null, dark: 'watchmen' }, buckets, [step()]);
    expect(r.pathStatus.batman).toBe('reading');
    expect(r.nextWorkIdByBucket.batman).toBe('dark-victory');
    expect(r.pathStatus.dark).toBe('unstarted'); // other lanes untouched
    expect(r.nextWorkIdByBucket.dark).toBe('watchmen');
  });

  it('overrides a lane that was already pointing at a different book', () => {
    const r = applyArcNextSteps({ batman: 'reading' }, { batman: 'hush' }, buckets, [step()]);
    expect(r.nextWorkIdByBucket.batman).toBe('dark-victory');
  });

  it('ignores a next step the reader cannot open tonight', () => {
    const r = applyArcNextSteps({ batman: 'not_in_path' }, { batman: null }, buckets, [step({ accessible: false, own: 'none' })]);
    expect(r.pathStatus.batman).toBe('not_in_path');
    expect(r.nextWorkIdByBucket.batman).toBeNull();
  });

  it('ignores a step whose lane is unknown, and does not mutate its inputs', () => {
    const ps = { batman: 'not_in_path' as const };
    const nx = { batman: null };
    const r = applyArcNextSteps(ps, nx, new Map(), [step()]);
    expect(r.pathStatus).toEqual(ps);
    applyArcNextSteps(ps, nx, buckets, [step()]);
    expect(ps.batman).toBe('not_in_path');
    expect(nx.batman).toBeNull();
  });
});

describe('journeyReason', () => {
  it('names the journey and the chapter', () => {
    expect(journeyReason(step())).toBe('Next step in your journey: Batman: From Year One to Legacy · The First Robin.');
  });
});
