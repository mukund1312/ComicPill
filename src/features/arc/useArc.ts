// The screen-facing hook for one saved arc: db -> pure engine -> plain result.
import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  branchesOf, getUserArc, loadArcLibrary, loadWorkTitles, planForUserArc, startBranch, updateUserArc, deleteUserArc,
} from '../../lib/db/queries/arc';
import { upsertLibraryEntry } from '../../lib/db/queries/library';
import { buildArc } from '../../lib/engines/arc/build';
import { ARC_TEMPLATES } from '../../lib/engines/arc/templates';
import type { ArcDepth } from '../../lib/engines/arc/types';

export const DEPTHS: { id: ArcDepth; label: string; blurb: string }[] = [
  { id: 'essential', label: 'Essential', blurb: 'The core story.' },
  { id: 'recommended', label: 'Recommended', blurb: 'Key character development and major events.' },
  { id: 'completionist', label: 'Completionist', blurb: 'A deep dive through connected runs and events.' },
];

/** How many books each depth would put on the main path, for the picker. */
export function depthCounts(templateKey: string): Record<ArcDepth, number> {
  const template = ARC_TEMPLATES[templateKey];
  const lib = loadArcLibrary();
  const count = (d: ArcDepth) => template
    ? buildArc(template, d, lib).chapters.reduce((n, c) => n + c.totalItems, 0)
    : 0;
  return { essential: count('essential'), recommended: count('recommended'), completionist: count('completionist') };
}

export function useArc(arcId: string) {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  // Coming back from a comic's page (where the reader may have marked it
  // finished) must re-derive the plan, or "you are here" goes stale.
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const data = useMemo(() => {
    const arc = getUserArc(arcId);
    if (!arc) return null;
    const plan = planForUserArc(arc);
    if (!plan) return null;
    return { arc, plan, titles: loadWorkTitles(), counts: depthCounts(arc.templateKey) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arcId, tick]);

  const setDepth = useCallback((depth: ArcDepth) => {
    updateUserArc(arcId, { depth }, new Date());
    refresh();
  }, [arcId, refresh]);

  const startReading = useCallback((workId: string) => {
    upsertLibraryEntry(workId, { status: 'reading' });
    refresh();
  }, [refresh]);

  const remove = useCallback(() => deleteUserArc(arcId), [arcId]);

  // Side journeys started from this one, and (if this IS one) where it came from.
  const branches = useMemo(() => branchesOf(arcId).map((a) => {
    const plan = planForUserArc(a);
    return { id: a.id, title: plan?.title ?? a.templateKey, percent: plan?.percentComplete ?? 0 };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [arcId, tick]); // tick = re-read the database after a change
  const parent = useMemo(() => {
    const parentId = data?.arc.parentArcId;
    const p = parentId ? getUserArc(parentId) : null;
    const plan = p ? planForUserArc(p) : null;
    return p && plan ? { id: p.id, title: plan.title } : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.arc.parentArcId, tick]);
  const branchInto = useCallback((templateKey: string) => startBranch(arcId, templateKey, new Date()).id, [arcId]);

  return { ...data, setDepth, startReading, remove, refresh, branches, parent, branchInto };
}
