// The Library screen's data source: every work with its edition, ownership
// and read status, ready for a cover grid. Filtering/sorting stays in the
// screen layer (plain array operations) — nothing here is engine logic.
import { useMemo, useState } from 'react';
import { loadAllWorkContexts, upsertLibraryEntry } from '../../lib/db/queries/library';
import type { Own, ReadStatus } from '../../lib/types/domain';

export interface LibraryItem {
  workId: string;
  title: string;
  bucket: string;
  own: Own;
  status: ReadStatus;
  rating: number | null;
  keeper: boolean;
  formatVerdict: 'physical' | 'digital';
  coverPath: string | null;
}

export function useLibrary() {
  const [tick, setTick] = useState(0);

  const items: LibraryItem[] = useMemo(() => {
    return loadAllWorkContexts().map((ctx) => ({
      workId: ctx.work.id,
      title: ctx.work.title,
      bucket: ctx.bucket,
      own: (ctx.library?.own ?? 'none') as Own,
      status: (ctx.library?.status ?? 'none') as ReadStatus,
      rating: ctx.library?.rating ?? null,
      keeper: ctx.work.keeperFlag,
      formatVerdict: (ctx.edition?.format ?? 'digital') as 'physical' | 'digital',
      coverPath: ctx.work.coverPath,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  function setOwnership(workId: string, own: Own) {
    upsertLibraryEntry(workId, { own });
    setTick((t) => t + 1);
  }
  function setStatus(workId: string, status: ReadStatus) {
    upsertLibraryEntry(workId, { status });
    setTick((t) => t + 1);
  }

  return { items, setOwnership, setStatus, refresh: () => setTick((t) => t + 1) };
}
