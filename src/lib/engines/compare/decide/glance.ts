// "Compare at a glance": the ten dimensions, but only where they help. A row
// where every book reads the same says nothing, so it is collapsed into one
// line; mood is hidden when no mood was set; the rows that actually separate
// the books come first.
import { DIMENSION_NAME } from './evaluate';
import type { Evaluated } from './constraints';
import type { DimensionKey, Glance, GlanceRow } from './types';

const ORDER: DimensionKey[] = ['goal', 'continuity', 'readiness', 'taste', 'mood', 'experience', 'character', 'access', 'commitment', 'variety'];

const UNIFORM_NOTE: Partial<Record<DimensionKey, (label: string, n: number) => string>> = {
  readiness: (_l, n) => (n > 1 ? 'All of these are ready to read.' : 'It is ready to read.'),
  access: (_l, n) => (n > 1 ? 'You can read any of these tonight.' : 'You can read it tonight.'),
};

export function buildGlance(items: Evaluated[], hasMood: boolean): Glance {
  const rows: GlanceRow[] = [];
  const uniformNotes: string[] = [];
  const spreads = new Map<DimensionKey, number>();

  for (const key of ORDER) {
    if (key === 'mood' && !hasMood) continue; // "No mood set" x4 is wasted space
    const cells = items.map((e) => ({ workId: e.workId, label: e.dims.find((d) => d.key === key)!.label }));
    const labels = new Set(cells.map((c) => c.label));
    // Experience always differs in kind, so it is always worth showing.
    const informative = key === 'experience' ? true : labels.size > 1;
    if (!informative) {
      const note = UNIFORM_NOTE[key]?.(cells[0]?.label ?? '', items.length);
      if (note) uniformNotes.push(note);
      continue;
    }
    const scores = items.map((e) => e.dims.find((d) => d.key === key)!.score);
    spreads.set(key, Math.max(...scores) - Math.min(...scores));
    rows.push({ key, name: DIMENSION_NAME[key], informative, cells });
  }

  // Largest real difference first; experience last (descriptive, not decisive).
  rows.sort((a, b) => (b.key === 'experience' ? -1 : a.key === 'experience' ? 1 : (spreads.get(b.key) ?? 0) - (spreads.get(a.key) ?? 0)));
  return { rows, uniformNotes };
}
