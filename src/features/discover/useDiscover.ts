import { useCallback, useMemo, useState } from 'react';
import { appendEvent } from '../../lib/db/queries/events';
import { loadAllScorableWorks } from '../../lib/db/queries/library';
import { getProfile, invalidateProfile } from '../../lib/db/queries/profile';
import { buildDeck } from '../../lib/engines/recommend/deck';

const EMPTY = { dimension: null, tag: null, value: null, calibration: null, appetite: null, exploreGoodOrBetter: null } as const;
export function useDiscover() {
  const [index, setIndex] = useState(0);
  const deck = useMemo(() => buildDeck([...loadAllScorableWorks().values()].filter((work) => work.own === 'none'), getProfile(new Date()), 5), []);
  const current = deck[index] ?? null;
  const signal = useCallback((type: 'swipe_left' | 'swipe_right' | 'swipe_up', value?: 1 | 2 | 3) => {
    if (!current) return;
    appendEvent({ workId: current.work.id, type, ...EMPTY, value: value ?? null, occurredAt: new Date().toISOString() });
    invalidateProfile(new Date()); setIndex((i) => i + 1);
  }, [current]);
  return { deck, current, index, pass: () => signal('swipe_left'), read: () => signal('swipe_right'), rate: (value: 1 | 2 | 3) => signal('swipe_up', value), reset: () => setIndex(0) };
}
