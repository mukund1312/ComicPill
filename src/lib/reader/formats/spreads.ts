import type { PageSize } from './imageSize';

export const isWide = (s: PageSize | null | undefined) => !!s && s.width > s.height * 1.1;

/**
 * Groups pages into reading units. Single mode: one page each. Spread mode (landscape):
 * the cover stands alone, wide pages (already a spread) stand alone, the rest pair up.
 */
export function buildUnits(sizes: Array<PageSize | null>, spread: boolean): number[][] {
  const n = sizes.length; const units: number[][] = [];
  if (!spread) { for (let i = 0; i < n; i++) units.push([i]); return units; }
  let i = 0;
  while (i < n) {
    if (i === 0 || isWide(sizes[i]) || i + 1 >= n || isWide(sizes[i + 1])) { units.push([i]); i += 1; }
    else { units.push([i, i + 1]); i += 2; }
  }
  return units;
}

export function unitIndexOf(units: number[][], page: number): number {
  const i = units.findIndex((u) => u.includes(page));
  return i < 0 ? 0 : i;
}
