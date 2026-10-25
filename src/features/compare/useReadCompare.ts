import { useCallback, useMemo, useState } from 'react';
import { compareForRead, type ReadCompareOutcome } from '../../lib/db/queries/compare';
import { useTravelMode } from '../../lib/state/travelMode';
import type { Intent } from '../../lib/engines/compare/decide/types';
import { searchWorks } from '../../lib/db/queries/search';
import { isAccessible } from '../../lib/util/own';
import { useLibrary } from '../library/useLibrary';

export type SearchCandidate = {
  workId: string;
  title: string;
  creators: string[];
  characters: string[];
  own: ReturnType<typeof useLibrary>['items'][number]['own'];
  status: ReturnType<typeof useLibrary>['items'][number]['status'];
  group: 'library' | 'wishlist' | 'catalog';
};

const groupRank: Record<SearchCandidate['group'], number> = { library: 0, wishlist: 1, catalog: 2 };

function groupFor(own: SearchCandidate['own']): SearchCandidate['group'] {
  if (isAccessible(own)) return 'library';
  if (own === 'wishlist' || own === 'ordered') return 'wishlist';
  return 'catalog';
}

/** UI seam for Compare's read-order decision. The pure engine stays in
 * `engines/compare`; this hook only joins catalog search with local ownership
 * and owns the temporary slot state required by the screen. */
export function useReadCompare() {
  const library = useLibrary();
  const [slots, setSlots] = useState<(string | null)[]>([null, null]);
  const [outcome, setOutcome] = useState<ReadCompareOutcome | null>(null);
  const [intent, setIntent] = useState<Intent>('best');
  const [rereads, setRereads] = useState(false);
  const [mood, setMood] = useState<string | null>(null);
  const digitalOnly = useTravelMode((s) => s.digitalOnly);
  const byId = useMemo(() => new Map(library.items.map((item) => [item.workId, item])), [library.items]);

  const addSlot = useCallback(() => setSlots((current) => current.length < 6 ? [...current, null] : current), []);
  const setSlot = useCallback((index: number, workId: string | null) => {
    setSlots((current) => current.map((value, slotIndex) => slotIndex === index ? workId : value));
    setOutcome(null);
  }, []);
  const addCandidate = useCallback((workId: string) => {
    setSlots((current) => {
      if (current.includes(workId)) return current;
      const openIndex = current.findIndex((id) => id === null);
      if (openIndex >= 0) return current.map((id, index) => index === openIndex ? workId : id);
      return current.length < 6 ? [...current, workId] : current;
    });
    setOutcome(null);
  }, []);
  const search = useCallback((query: string): SearchCandidate[] => {
    return searchWorks(query).map((result) => {
      const item = byId.get(result.workId);
      const own = item?.own ?? 'none';
      return { ...result, own, status: item?.status ?? 'none', group: groupFor(own) };
    }).sort((a, b) => groupRank[a.group] - groupRank[b.group] || a.title.localeCompare(b.title));
  }, [byId]);
  const selected = slots.map((id) => id ? byId.get(id) ?? null : null);
  const canCompare = slots.filter((id): id is string => id !== null).length >= 2;
  const compute = useCallback((next: { intent: Intent; rereads: boolean; mood: string | null }) => {
    const workIds = slots.filter((id): id is string => id !== null);
    if (workIds.length < 2) return;
    setOutcome(compareForRead(workIds, {
      now: new Date(), mood: next.mood, intent: next.intent, rereadsAllowed: next.rereads,
      travelMode: digitalOnly ? 'digital' : 'any',
    }));
  }, [slots, digitalOnly]);
  const run = useCallback((nextMood: string | null = null) => { setMood(nextMood); compute({ intent, rereads, mood: nextMood }); }, [compute, intent, rereads]);
  // "What matters tonight?" and "consider rereads" re-run the decision in place.
  const chooseIntent = useCallback((next: Intent) => { setIntent(next); compute({ intent: next, rereads, mood }); }, [compute, rereads, mood]);
  const toggleRereads = useCallback(() => { const next = !rereads; setRereads(next); compute({ intent, rereads: next, mood }); }, [compute, intent, rereads, mood]);

  return { slots, selected, outcome, canCompare, addSlot, setSlot, addCandidate, search, run, intent, chooseIntent, rereads, toggleRereads, travelDigital: digitalOnly };
}
