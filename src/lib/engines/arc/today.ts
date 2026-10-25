// Makes Today aware of the reader's journeys. Today's engine already has a
// path signal (P): 1 when a book is the next one in a lane the reader is
// actively reading. A journey the reader asked for IS an active path, so its
// next step is fed in as that lane's next book — no second scoring system.
import type { TodayInput } from '../../types/engine-io';
import type { nextSteps } from './membership';

type Step = ReturnType<typeof nextSteps>[number];

/** Only steps the reader can actually open tonight: a book that isn't in hand
 *  can't be "tonight's pick", so it must not steer the lane. Returns new
 *  objects; the inputs are not mutated. */
export function applyArcNextSteps(
  pathStatus: TodayInput['pathStatus'],
  nextWorkIdByBucket: TodayInput['nextWorkIdByBucket'],
  bucketByWork: ReadonlyMap<string, string>,
  steps: Step[],
): { pathStatus: TodayInput['pathStatus']; nextWorkIdByBucket: TodayInput['nextWorkIdByBucket'] } {
  const status = { ...pathStatus };
  const next = { ...nextWorkIdByBucket };
  for (const step of steps) {
    if (!step.accessible) continue;
    const bucket = bucketByWork.get(step.workId);
    if (!bucket) continue;
    status[bucket] = 'reading';
    next[bucket] = step.workId;
  }
  return { pathStatus: status, nextWorkIdByBucket: next };
}

/** The reason line Today shows for a pick that advances a journey. */
export function journeyReason(step: Pick<Step, 'arcTitle' | 'chapterTitle'>): string {
  return `Next step in your journey: ${step.arcTitle} · ${step.chapterTitle}.`;
}
