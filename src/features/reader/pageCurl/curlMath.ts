// Page-curl geometry: pure maths (worklets), kept apart from the shader and the gesture so it can be tested on its own.

/**
 * Where the page was taken hold of, and how the finger has moved since.
 * `x`, `y` are the held point on the page (0..1 across its width and down its height; x is 1 when the page is being turned back, whose held
 * point is its outer edge); `dy` is the finger's vertical travel in pixels since it went down; `span` is how far the finger travels sideways
 * for a whole turn (the pager's width).
 */
export type Grab = { x: number; y: number; dy: number; span: number };

/**
 * The fold's direction for a grab. Paper held at a point is folded along the perpendicular bisector of where that point was and where the
 * finger has taken it, so the fold faces from the finger back to the grab point. Two parts add up:
 *   - where it was grabbed: a hold near the top corner lifts that corner first (fold tilted one way), near the bottom the other way, in the middle
 *     the whole edge comes up together;
 *   - where the finger has gone: dragging down or up while turning tilts the fold to follow the finger.
 * Both relax as the sheet goes over, so it always lands square. Bounded so the fold can never swing round.
 */
export function foldAngle(t: number, pageW: number, grab: Grab) {
  'worklet';
  const g = Math.max(-1, Math.min(1, grab.y * 2 - 1));
  const lead = 0.32 * g * Math.pow(1 - t, 1.3);
  // Sideways travel so far; a floor keeps a tiny drag from swinging the fold wildly.
  const along = Math.max(t * grab.span, 0.35 * pageW);
  const follow = Math.atan2(-grab.dy, along) * (1 - t * t);
  return Math.max(-0.85, Math.min(0.85, lead + follow));
}

/**
 * The cylinder (axis position `a` along the fold's normal, radius `R`) for a sheet of width W and height H, measured from the middle of its
 * free-standing (left) edge, at turn progress `t`.
 *
 * Paper held at a point G and carried to F folds along the perpendicular bisector of G and F; with a roll of radius R the axis sits at
 * (sG + sF − πR) / 2 along the fold's normal. So the point that was touched stays under the finger. Before the finger has moved, the held
 * point is the page's leading corner (nothing curls, so nothing jumps when the finger first moves); it hands over to the real grab point
 * within the first few millimetres of travel. Towards the end the sheet is carried a little faster than the finger so that, by the time the
 * pager arrives (t = 1), the roll has passed the far corner and the whole sheet is over.
 */
export function curlGeometry(t: number, width: number, height: number, grab: Grab) {
  'worklet';
  const phi = foldAngle(t, width, grab);
  const c = Math.cos(phi); const sn = Math.sin(phi);
  // The page's extent along the fold's normal: its leading corner (sMax) and its trailing one (sMin).
  const sMax = width * c + (height / 2) * Math.abs(sn);
  const sMin = -(height / 2) * Math.abs(sn);
  // The held point. A hold far in from the edge is treated as one just past the middle: no one turns a page by pinching its spine side.
  const gx = Math.max(0.55, Math.min(1, grab.x)) * width;
  const gy = (Math.max(0, Math.min(1, grab.y)) - 0.5) * height;
  const sG = gx * c + gy * sn;
  const R1 = width * 0.07;
  const dEnd = 2 * (sG - sMin) + 2 * R1 - Math.PI * R1;
  const span = Math.max(grab.span, 1);
  // How far the finger has carried the held point along the fold's normal (it moved t·span left and dy down).
  const travel = Math.max(0, t * span * c - grab.dy * sn);
  const D = travel + Math.max(0, dEnd - span) * t * t * t;
  // The roll is fattest mid-turn, like a sheet held loosely, but never more than the travel allows: the held point is always over the top
  // of the roll and flat on the far side, which is what keeps it under the finger.
  const R = Math.max(0.5, Math.min(width * (0.07 + 0.11 * Math.sin(Math.PI * t)), D / Math.PI));
  const hold = sG + (sMax - sG) * Math.exp(-D / (0.12 * width));
  const a = hold - D / 2 - (Math.PI * R) / 2;
  return { a, R, phi };
}

/** The roll for a spread: it starts at the outer edge `E`, ends at the spine `S` (thin again), and is fattest half-way. */
export function spreadGeometry(t: number, S: number, E: number, pageH: number, grab: Grab) {
  'worklet';
  const P = E - S;
  // The fold leans towards the held corner and follows the finger, as on a single page; it is upright by the time the page lands.
  const phi = foldAngle(t, P, grab) * 0.8;
  const R = P * (0.02 + 0.16 * Math.sin(Math.PI * t));
  // Measured at right angles to the fold from the spine: the right page reaches out to its leading outer corner at sMax.
  const sMax = P * Math.cos(phi) + (pageH / 2) * Math.abs(Math.sin(phi));
  // At t = 1 the turned page lies mirrored about the spine (and the fold is upright): 2a + πR = 0.
  const a = sMax - t * sMax - t * ((Math.PI * R) / 2);
  return { a, R, phi };
}

/**
 * Where a released page settles: the page it was turned from, the next or the previous one. Momentum counts: the release velocity carries
 * the page on by up to 0.6 of a page, so a quick flick finishes a turn that has barely started while a slow, short drag falls back. A release
 * never skips more than one page from where the drag began. `velocityX` is the finger's (px/s; leftwards is negative).
 */
export function releaseTarget(offset: number, startPage: number, velocityX: number, width: number, lastIndex: number) {
  'worklet';
  const w = Math.max(width, 1);
  const carry = Math.max(-0.6, Math.min(0.6, (-velocityX / w) * 0.25));
  let target = Math.round(offset / w + carry);
  target = Math.max(startPage - 1, Math.min(startPage + 1, target));
  return Math.max(0, Math.min(lastIndex, target));
}
