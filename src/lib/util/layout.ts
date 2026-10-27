// One place that decides how roomy the screen is, so every screen agrees on it.
//   phone   — under 600dp on its short side
//   tablet  — 600dp or more on its short side
//   rail    — wide enough (840dp+) that the tabs move from a floating bar to a side rail

export const RAIL_WIDTH = 92;
const TABLET_MIN = 600;
const RAIL_MIN = 840;

export type Layout = {
  width: number; height: number;
  isTablet: boolean; isLandscape: boolean;
  /** Tabs live in a side rail instead of the floating bar. */
  rail: boolean;
  /** Width left for content once the rail is taken off. */
  contentWidth: number;
  /** Width content is allowed to use: comfortable line lengths on big screens, everything on a phone. */
  maxContent: number;
  /** How many covers of at least `min` dp fit in a row of the allowed width, never fewer than `floor`. */
  columns: (min: number, gutter?: number, floor?: number) => number;
};

export function layoutFor(width: number, height: number): Layout {
  const isTablet = Math.min(width, height) >= TABLET_MIN;
  const rail = width >= RAIL_MIN;
  const contentWidth = rail ? width - RAIL_WIDTH : width;
  const maxContent = isTablet ? Math.min(contentWidth, rail ? 1040 : 720) : contentWidth;
  return {
    width, height, isTablet, isLandscape: width > height, rail, contentWidth, maxContent,
    columns: (min, gutter = 16, floor = 2) => Math.max(floor, Math.floor((maxContent - 32 + gutter) / (min + gutter))),
  };
}

