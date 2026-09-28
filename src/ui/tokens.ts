// Design tokens — ComicPill's black + deep crimson identity.
// Source of truth for the frontend build (see /docs/frontend-blueprint.md).
// Comic covers stay the visual heroes; this palette stays restrained.

export const color = {
  bg: '#08090B',
  surface: '#101114',
  surface2: '#17181C',
  border: '#27282D',
  text: '#F1EDE6',       // warm ivory
  muted: '#A6A3A0',
  faint: '#6F6D6A',
  accent: '#E32636',      // primary red
  accentDeep: '#A80D1C',  // deep crimson
  accentPressed: '#BF1726',
  positive: '#4E8C6B',    // subtle muted green
  warning: '#C9992F',     // warm gold/amber — Buy on Sale
  collectGold: '#D4AF37', // Collect label / keeper status
  digital: '#5B87B8',     // subtle cool blue
  tryDigital: '#8B6BAE',  // muted violet
  danger: '#E32636',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const;

// Type scale: Hero/Display 34 · Section title 24 · Card title 18 · Body 16 · Caption 13
export const type = { display: 34, title: 24, subtitle: 18, body: 16, caption: 13 } as const;

// Display/editorial (Playfair Display / Barlow Condensed feel) for headings;
// Inter for body and interface text.
export const font = {
  display: 'PlayfairDisplay_700Bold',
  displayMedium: 'PlayfairDisplay_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
} as const;

// Motion families: PRESS (tactile compression) · SNAP (slider/selection) ·
// SHEET (bottom-sheet movement) · COMMIT (swipe completion / decisive actions).
export const duration = { press: 120, snap: 220, sheet: 260, commit: 220 } as const;

export const PURCHASE_LABEL_COLOR = {
  collect: color.collectGold,
  buy_on_sale: color.warning,
  digital_is_fine: color.digital,
  try_digital_first: color.tryDigital,
  skip: color.faint,
} as const;
