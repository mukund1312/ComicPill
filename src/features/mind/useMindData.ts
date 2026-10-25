import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { buildAndSaveDigest, latestDigest } from '../../lib/mind/digestDb';
import type { Digest } from '../../lib/mind/engine/digest';
import type { SeriesRow, ShotRow } from '../../lib/mind/model';
import { counts, listDigests, listSeries } from '../../lib/mind/queries';
import { getMindSettings } from '../../lib/mind/settings';
import { sqliteStore } from '../../lib/mind/sqliteStore';

export type MindData = {
  shots: ShotRow[];
  series: SeriesRow[];
  digest: Digest | null;
  past: Digest[];
  totals: ReturnType<typeof counts>;
};

/** Everything the hub shows, re-read from SQLite whenever the screen is focused or `refresh()` is called. */
export function useMindData(): MindData & { refresh: () => void } {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  useFocusEffect(useCallback(() => {
    // The plan is rebuilt on every look so it always reflects the latest finds and ratings.
    const s = getMindSettings();
    if (s.digestEnabled || s.watching) { try { buildAndSaveDigest(); } catch { /* an empty library is fine */ } }
    refresh();
  }, [refresh]));
  const data = useMemo<MindData>(() => {
    const parsed = listDigests().map((r) => { try { return JSON.parse(r.json) as Digest; } catch { return null; } }).filter((d): d is Digest => !!d);
    return { shots: sqliteStore.listScreenshots(), series: listSeries(), digest: latestDigest(), past: parsed.slice(1), totals: counts() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
  return { ...data, refresh };
}
