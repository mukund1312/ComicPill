import { useCallback, useMemo, useState } from 'react';
import { appendEvent } from '../../lib/db/queries/events';
import { loadAllScorableWorks, loadAllWorkContexts } from '../../lib/db/queries/library';
import { getProfile, invalidateProfile } from '../../lib/db/queries/profile';
import { buildDeck } from '../../lib/engines/recommend/deck';
import { essentialCollection, type EssentialPick } from '../../lib/engines/recommend/essential';
import { EMPTY_COMIC_FILTERS, hasActiveFilters, matchesFilters, type ComicFilters, type FilterableComic } from '../../lib/util/comicFilters';

const EMPTY = { dimension: null, tag: null, value: null, calibration: null, appetite: null, exploreGoodOrBetter: null } as const;

/** Discover's candidate pool is "not yet read" — NOT "not yet owned". An
 *  earlier version filtered to `own === 'none'`, which meant Discover could
 *  never surface "you already own this great unread book", exactly the
 *  anti-consumption trust feature the product needs (job #33: "what can I
 *  read right now without buying anything?"). Owned-but-unread candidates
 *  are exactly as eligible as unowned ones here; buildDeck's card carries
 *  `work.own` already, so the UI can label "in your library" vs "new to
 *  you" without a separate query. */
export function useDiscover() {
  const [index, setIndex] = useState(0);
  const [filters, setFilters] = useState<ComicFilters>(EMPTY_COMIC_FILTERS);
  const contexts = useMemo(() => loadAllWorkContexts(), []);
  // ScorableWork deliberately carries no publisher/creator/character fields
  // (the engine-purity boundary — see purity.spec.ts), so filtering happens
  // here, at the query layer, before candidates ever reach buildDeck/
  // essentialCollection: this map is the only place that bridges the two.
  const filterableByWorkId = useMemo(() => {
    const m = new Map<string, FilterableComic>();
    for (const c of contexts) m.set(c.work.id, { publisher: c.work.publisher, creators: c.work.creators, characters: c.work.characters });
    return m;
  }, [contexts]);
  const publisherByWorkId = useMemo(() => new Map(contexts.map((c) => [c.work.id, c.work.publisher])), [contexts]);
  const deck = useMemo(() => {
    const finishedOrDropped = new Set(
      contexts.filter((c) => c.library?.status === 'done' || c.library?.status === 'dropped').map((c) => c.work.id),
    );
    const candidates = [...loadAllScorableWorks().values()]
      .filter((w) => !finishedOrDropped.has(w.id))
      .filter((w) => matchesFilters(filterableByWorkId.get(w.id) ?? { publisher: null, creators: [], characters: [] }, filters));
    return buildDeck(candidates, getProfile(new Date()), 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, filterableByWorkId]);
  const current = deck[index] ?? null;

  // "What must I actually own?" (job #9) — a constrained must-own ranking,
  // distinct from the taste-fit swipe deck above.
  const essentials: EssentialPick[] = useMemo(() => {
    const candidates = [...loadAllScorableWorks().values()]
      .filter((w) => matchesFilters(filterableByWorkId.get(w.id) ?? { publisher: null, creators: [], characters: [] }, filters));
    return essentialCollection(candidates, getProfile(new Date()), publisherByWorkId, { count: 8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, filterableByWorkId, publisherByWorkId]);
  const signal = useCallback((type: 'swipe_left' | 'swipe_right' | 'swipe_up', value?: 1 | 2 | 3) => {
    if (!current) return;
    appendEvent({ workId: current.work.id, type, ...EMPTY, value: value ?? null, occurredAt: new Date().toISOString() });
    invalidateProfile(new Date()); setIndex((i) => i + 1);
  }, [current]);
  return {
    deck, current, index, essentials, filters, filtersActive: hasActiveFilters(filters),
    setFilters: (f: ComicFilters) => { setFilters(f); setIndex(0); },
    pass: () => signal('swipe_left'), read: () => signal('swipe_right'), rate: (value: 1 | 2 | 3) => signal('swipe_up', value), reset: () => setIndex(0),
  };
}
