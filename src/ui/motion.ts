// One source of truth for ComicPill's four motion families. Reanimated
// gestures consume these presets; screens should not tune springs ad hoc.
export const motion = {
  press: { damping: 18, stiffness: 420, mass: 0.45 },
  snap: { damping: 20, stiffness: 300, mass: 0.65 },
  sheet: { damping: 24, stiffness: 260, mass: 0.8 },
  commit: { damping: 19, stiffness: 340, mass: 0.7 },
  duration: { press: 120, snap: 220, sheet: 260, commit: 220 },
} as const;
