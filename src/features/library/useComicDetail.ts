// Backs the comic detail / "cover page" screen: real summary, every edition
// of the work (for the format/price comparison), where it sits in its
// reading path (previous/next), and related works from the story graph.
import { useMemo, useState } from 'react';
import { loadComicDetail, type ComicDetail } from '../../lib/db/queries/detail';
import type { ContextLevel } from '../../lib/types/domain';

export function useComicDetail(workId: string | undefined, contextLevel: ContextLevel = 'recommended') {
  const [tick, setTick] = useState(0);
  const detail: ComicDetail | null = useMemo(
    () => (workId ? loadComicDetail(workId, contextLevel) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workId, contextLevel, tick],
  );
  return { detail, refresh: () => setTick((t) => t + 1) };
}
