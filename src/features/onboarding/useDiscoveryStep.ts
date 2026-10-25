// Holds what is on screen for one picking step. The picks themselves live in the
// persisted onboarding store; this rebuilds the same choices from them on resume.
import { useCallback, useMemo, useState } from 'react';
import { nextChoices, rebuildStep, searchEntities } from '../../lib/onboarding/discovery';
import { CHARACTER_BY_ID, type Entity } from '../../lib/onboarding/entities';
import { CREATOR_PHOTOS } from '../../lib/onboarding/creatorPhotos';
import type { Choice } from './PreferenceDiscoveryGrid';
import { poolFor, preferFor, relateFor, type DiscoveryStage } from './pools';

const OPENING = 9;
const NEXT = 3;

const describe = (e: Entity): Choice => ({
  id: e.id, label: e.name, workId: e.kind === 'creator' ? undefined : e.signatureWorkId, photo: e.kind === 'creator' ? CREATOR_PHOTOS[e.id] : undefined,
  sub: e.kind === 'character' ? (e.publisher === 'Indie' ? 'Indie' : e.publisher) : e.roles.join(' & '),
});

export function useDiscoveryStep(stage: DiscoveryStage, allPicks: readonly string[], seed: number, onToggle: (id: string) => void) {
  const pool = useMemo(() => poolFor(stage), [stage]);
  const relate = useMemo(() => relateFor(stage), [stage]);
  const inPool = useMemo(() => new Set(pool.map((e) => e.id)), [pool]);
  // Only this step's picks; the heroes chosen earlier only bias the villains' opening screen.
  const mine = useMemo(() => allPicks.filter((id) => inPool.has(id)), [allPicks, inPool]);
  const heroesPicked = useMemo(() => (stage === 'villains' ? allPicks.filter((id) => CHARACTER_BY_ID.get(id)?.alignment !== 'villain') : []), [stage, allPicks]);

  const [screen, setScreen] = useState(() =>
    rebuildStep({ pool, relate, selected: mine, seed, initialCount: OPENING, prefer: preferFor(stage, heroesPicked) }));
  const byId = useMemo(() => new Map(pool.map((e) => [e.id, e])), [pool]);

  const toggle = useCallback((id: string) => {
    if (!inPool.has(id)) return;
    onToggle(id);
    if (mine.includes(id)) {
      // Un-picking puts it straight back on screen, first.
      setScreen((s) => (s.visible.includes(id) ? s : { ...s, visible: [id, ...s.visible] }));
      return;
    }
    setScreen((s) => {
      const shown = new Set(s.shown).add(id);
      const visible = s.visible.filter((v) => v !== id);
      const r = nextChoices({ pool, relate, selected: [...mine, id], shown, visible, seed }, id, NEXT);
      r.add.forEach((a) => shown.add(a));
      return { shown, visible: visible.filter((v) => !r.retire.includes(v)).concat(r.add) };
    });
  }, [inPool, mine, onToggle, pool, relate, seed]);

  const choices = screen.visible.flatMap((id) => { const e = byId.get(id); return e && !mine.includes(id) ? [describe(e)] : []; });
  const picks = mine.flatMap((id) => { const e = byId.get(id); return e ? [describe(e)] : []; });
  const search = useCallback((q: string) => searchEntities(q, pool).map(describe), [pool]);

  return { choices, picks, toggle, search };
}

