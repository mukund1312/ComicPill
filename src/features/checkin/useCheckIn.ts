// Drives the 4-card check-in for one finished (or dropped) work. Each answer
// writes one real, replay-safe event immediately (see profile.ts's applySignal
// for how 'calibrate', 'appetite' and 'explore_outcome' feed back into the
// pure taste engine), so a mid-flow kill loses nothing and the profile can
// always be rebuilt from the log alone.
import { useMemo, useState } from 'react';
import { appendEvent } from '../../lib/db/queries/events';
import { upsertLibraryEntry, loadAllScorableWorks } from '../../lib/db/queries/library';
import { invalidateProfile, getProfile } from '../../lib/db/queries/profile';
import { wasLastShownAsExplore } from '../../lib/db/queries/shown_lookup';
import { pickCheckInCards, predictAppetite, type CheckInCard } from '../../lib/engines/taste/checkin';
import { detectFatigue } from '../../lib/engines/taste/fatigue';
import type { AppetiteAnswer, CalibrationAnswer, Dim } from '../../lib/types/domain';
import type { FinishedRead } from '../../lib/types/engine-io';

const RATING_TO_SIGNAL = {
  1: 'rating_not_for_me', 2: 'rating_meh', 3: 'rating_good', 4: 'rating_great', 5: 'rating_loved',
} as const;

const EMPTY_EVENT_FIELDS = { dimension: null, tag: null, value: null, calibration: null, appetite: null, exploreGoodOrBetter: null } as const;

export function useCheckIn(workId: string, recentFinished: FinishedRead[]) {
  const now = new Date();
  const works = useMemo(() => loadAllScorableWorks(), []);
  const work = works.get(workId);
  const profile = useMemo(() => getProfile(now), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [cardIndex, setCardIndex] = useState(0);
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [lastCalibrationDim] = useState<Dim | null>(null);

  const cards: CheckInCard[] = useMemo(() => {
    if (!work) return [];
    return pickCheckInCards(work, profile, { lastCalibrationDim, goodOrBetter: (rating ?? 3) >= 3 });
  }, [work, profile, lastCalibrationDim, rating]);

  const fatigue = useMemo(() => detectFatigue(recentFinished, [], now), [recentFinished]); // eslint-disable-line react-hooks/exhaustive-deps
  const appetite = useMemo(() => predictAppetite(recentFinished, fatigue), [recentFinished, fatigue]);

  function answerRating(r: 1 | 2 | 3 | 4 | 5) {
    setRating(r);
    appendEvent({ workId, type: RATING_TO_SIGNAL[r], ...EMPTY_EVENT_FIELDS, occurredAt: now.toISOString() });
    upsertLibraryEntry(workId, { status: 'done', rating: r, finishedAt: now.toISOString() });

    // If this work was shown as the Explore slot, its outcome feeds back into
    // adventurousness/exploration rate too (a separate, pure signal from the
    // rating itself — see engines/taste/profile.ts's applyExploreOutcome).
    if (wasLastShownAsExplore(workId)) {
      appendEvent({ workId, type: 'explore_outcome', ...EMPTY_EVENT_FIELDS, exploreGoodOrBetter: r >= 3, occurredAt: now.toISOString() });
    }
  }

  function answerDropped() {
    appendEvent({ workId, type: 'dropped', ...EMPTY_EVENT_FIELDS, occurredAt: now.toISOString() });
    upsertLibraryEntry(workId, { status: 'dropped' });
  }

  function answerChip(kind: 'genre' | 'creator' | 'character' | 'bucket' | 'note', value: string) {
    appendEvent({ workId, type: 'chip', ...EMPTY_EVENT_FIELDS, tag: { kind, value }, occurredAt: now.toISOString() });
  }

  function answerCalibration(dimension: Dim, answer: CalibrationAnswer) {
    appendEvent({ workId, type: 'calibrate', ...EMPTY_EVENT_FIELDS, dimension, calibration: answer, occurredAt: now.toISOString() });
    setCardIndex((i) => i + 1);
  }

  function answerAppetite(answer: AppetiteAnswer) {
    appendEvent({ workId, type: 'appetite', ...EMPTY_EVENT_FIELDS, appetite: answer, occurredAt: now.toISOString() });
    finish();
    // 'appetite' is always the last card (see pickCheckInCards), so advancing
    // past it makes cards[cardIndex] undefined and the screen falls through
    // to the "Logged." done state. Previously this called finish() alone,
    // which invalidates the taste profile but never moves cardIndex — the
    // screen stayed on the same appetite question forever after answering,
    // with no visible response to the tap.
    setCardIndex((i) => i + 1);
  }

  function skip() {
    setCardIndex((i) => i + 1);
  }
  function finish() {
    invalidateProfile(new Date());
  }

  return {
    work, cards, cardIndex, currentCard: cards[cardIndex] ?? null,
    appetitePreset: appetite.preset, appetiteLine: appetite.line,
    answerRating, answerDropped, answerChip, answerCalibration, answerAppetite, skip, finish,
  };
}
