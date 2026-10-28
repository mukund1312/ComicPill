// How many comics sit in one row of a cover grid. One choice for every grid in the app; 0 means "automatic" (as many as fit).
import { useSyncExternalStore } from 'react';
import { getMeta, setMeta } from '../lib/db/queries/meta';
import { useLayout } from './layout';

const KEY = 'grid_per_row';
export const PER_ROW_CHOICES = [1, 2, 3, 4, 5, 6] as const;
let cached: number | null = null;
const listeners = new Set<() => void>();

const read = (): number => {
  if (cached === null) { const v = Number(getMeta(KEY)); cached = Number.isInteger(v) && v >= 1 && v <= 6 ? v : 0; }
  return cached;
};
export const setPerRow = (n: number): void => { cached = n; setMeta(KEY, String(n)); listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const usePerRow = (): number => useSyncExternalStore(subscribe, read, read);

/** The column count for a cover grid: the reader's choice, or as many as fit when it is automatic. */
export function useGridColumns(autoMinCell: number): number {
  const layout = useLayout(); const perRow = usePerRow();
  return perRow || layout.columns(autoMinCell);
}
