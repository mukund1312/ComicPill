// Design tokens — ComicPill's black + deep crimson identity.
// Source of truth for the frontend build (see /docs/frontend-blueprint.md).
// Comic covers stay the visual heroes; this palette stays restrained.

export const color = {
  bg: '#0A0A0D',
  surface: '#131318',
  surface2: '#1B1B22',
  border: '#FFFFFF16',
  text: '#F5F5F7',
  muted: '#9A9AA3',
  faint: '#6B6B75',
  accent: '#F23546',      // primary red
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

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;

// Type scale. Every text size in the app is one of these nine steps (artwork lettering and tiny badges excepted):
// 34 large title · 30 · 26 title · 22 section · 18 card title · 16 body · 14 secondary · 12 caption · 11 label
export const type = { display: 34, title: 26, section: 22, subtitle: 18, body: 16, callout: 14, caption: 12, label: 11 } as const;

// One clean sans family (Inter, close to iOS's SF Pro): heavy weights for titles, regular/medium/semibold for interface text.
export const font = {
  display: 'Inter_800ExtraBold',
  displayMedium: 'Inter_700Bold',
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
