// The Today screen's one entrypoint. Wraps the db -> engine -> db round trip
// described in the plan: loadTodayInput -> pickToday -> recordShown.
// A screen calls useToday(), gets TodaySlots plus per-slot Work data and
// reasons, and never touches the db or the engine directly.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadTodayInput } from '../../lib/db/queries/today';
import { recordShown } from '../../lib/db/queries/shown';
import { recordNotTonight } from '../../lib/db/queries/events';
import { loadAllWorkContexts } from '../../lib/db/queries/library';
import { pickToday } from '../../lib/engines/recommend/slots';
import { reasonsFor } from '../../lib/engines/recommend/reasons';
import { isAccessible } from '../../lib/util/own';
import { useTravelMode } from '../../lib/state/travelMode';
import { useSettings } from '../../lib/state/settings';
import { DEFAULT_ENGINE_CONFIG } from '../../lib/types/engine-io';
import type { TodaySlots } from '../../lib/types/engine-io';
import type { Own } from '../../lib/types/domain';
import { dateKey } from '../../lib/util/dateKey';
import { loadNextSteps } from '../../lib/db/queries/arc';
import { journeyReason } from '../../lib/engines/arc/today';

export interface TodayCard {
  workId: string;
  title: string;
  bucket: string;
  own: Own;
  // Precomputed here (not left for the screen to re-derive) so every screen
  // agrees on what "in your library" means — 'wishlist'/'ordered' are real
  // states but not yet readable, same rule as everywhere else in the app.
  inLibrary: boolean;
  reasons: string[];
}

export interface TodayResult {
  continueCard: TodayCard | null;
  switchCard: TodayCard | null;
  exploreCard: TodayCard | null;
  lead: TodaySlots['lead'];
  mood: string | null;
  setMood: (mood: string | null) => void;
  ownedOnly: boolean;
  setOwnedOnly: (v: boolean) => void;
  // "Travel mode" — recommend only what's reachable right now without a
  // physical shelf. Independent of ownedOnly (see TodayInput.formatFilter).
  formatFilter: 'any' | 'physical' | 'digital';
  setFormatFilter: (v: 'any' | 'physical' | 'digital') => void;
  notTonight: (workId: string) => void;
  refresh: () => void;
}

function toCard(slot: TodaySlots['continueSlot'], titleById: Map<string, { title: string; bucket: string; own: Own }>, journeyByWork: Map<string, string>): TodayCard | null {
  if (!slot) return null;
  const meta = titleById.get(slot.workId);
  const own = meta?.own ?? 'none';
  return {
    workId: slot.workId,
    title: meta?.title ?? slot.workId,
    bucket: meta?.bucket ?? '',
    own,
    inLibrary: isAccessible(own),
    // The journey reason leads: it is the most specific "why" the app has.
    reasons: [...(journeyByWork.has(slot.workId) ? [journeyByWork.get(slot.workId)!] : []), ...reasonsFor(slot.parts)],
  };
}

export function useToday(): TodayResult {
  const [mood, setMood] = useState<string | null>(null);
  const [ownedOnly, setOwnedOnly] = useState(false);
  // Global — see src/lib/state/travelMode.ts. Toggling this here also
  // narrows Library's grid to digitally-accessible books.
  const digitalOnly = useTravelMode((s) => s.digitalOnly);
  const setDigitalOnly = useTravelMode((s) => s.setDigitalOnly);
  const formatFilter: 'any' | 'physical' | 'digital' = digitalOnly ? 'digital' : 'any';
  const setFormatFilter = (v: 'any' | 'physical' | 'digital') => setDigitalOnly(v === 'digital');
  const personalized = useSettings((s) => s.personalizedRecommendations);
  const [tick, setTick] = useState(0); // bump to force a recompute after a write

  // Pure computation only — the shown-log write happens in the effect below,
  // never during render (a render may be retried or discarded by React).
  const { slots, computedAt } = useMemo(() => {
    const now = new Date();
    const input = loadTodayInput(now, ownedOnly, formatFilter);
    const picked = pickToday(input, { mood, dateKey: dateKey(now), config: DEFAULT_ENGINE_CONFIG, now });
    return { slots: picked, computedAt: now };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood, ownedOnly, formatFilter, tick, personalized]);

  useEffect(() => { recordShown(slots, computedAt); }, [slots, computedAt]);

  const titleById = useMemo(() => {
    const map = new Map<string, { title: string; bucket: string; own: Own }>();
    for (const ctx of loadAllWorkContexts()) {
      map.set(ctx.work.id, { title: ctx.work.title, bucket: ctx.bucket, own: (ctx.library?.own ?? 'none') as Own });
    }
    return map;
  }, [tick]);

  // Which of tonight's cards advance a journey (recomputed with the slots).
  const journeyByWork = useMemo(
    () => new Map(loadNextSteps().filter((s) => s.accessible).map((s) => [s.workId, journeyReason(s)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots],
  );

  const notTonight = useCallback((workId: string) => {
    recordNotTonight(workId, new Date().toISOString());
    setTick((t) => t + 1);
  }, []);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return {
    continueCard: toCard(slots.continueSlot, titleById, journeyByWork),
    switchCard: toCard(slots.switchSlot, titleById, journeyByWork),
    exploreCard: toCard(slots.exploreSlot, titleById, journeyByWork),
    lead: slots.lead,
    mood, setMood, ownedOnly, setOwnedOnly, formatFilter, setFormatFilter, notTonight, refresh,
  };
}
