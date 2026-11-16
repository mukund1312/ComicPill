// Page-curl geometry: pure maths (worklets), kept apart from the shader and the gesture so it can be tested on its own.

/**
 * Where the page was taken hold of, and how the finger has moved since.
 * `x`, `y` are the held point on the page (0..1 across its width and down its height; x is 1 when the page is being turned back, whose held
 * point is its outer edge); `dy` is the finger's vertical travel in pixels since it went down; `span` is how far the finger travels sideways
 * for a whole turn (the pager's width).
 */
export type Grab = { x: number; y: number; dy: number; span: number; back?: boolean };

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
  // Turning back, the page arrives already folded over, mirrored: the corner nearest the finger must be the one that comes over first,
  // which is the opposite tilt to lifting that corner on the way forward.
  const lead = (grab.back ? -0.32 : 0.32) * g * Math.pow(1 - t, 1.3);
  // Sideways travel so far; a floor keeps a tiny drag from swinging the fold wildly.
  const along = Math.max(t * grab.span, 0.35 * pageW);
  const follow = Math.atan2(-grab.dy, along) * (1 - t * t);
  return Math.max(-0.85, Math.min(0.85, lead + follow));
}

/**
 * The pose of a turning sheet. The sheet is not one rigid cylinder: each strip of paper running at right angles to the fold rolls with its
 * own radius, tight near the finger (where the paper is being pulled) and looser further along the fold, the way a real sheet bends freely
 * around the point it is held by. `rollAt` gives the roll for one strip; the shader does the same per pixel.
 *   A0   half of the mirror line: a sheet point at s' that has come over lies flat at 2·A0 − s' (whatever the strip's radius)
 *   Rn   the nominal roll radius at this stage of the turn
 *   Rcap the largest radius the finger's travel allows (the held point must already be over the top of the roll)
 *   vG   where the held point is along the fold
 *   H    the sheet's length along the fold (for how quickly the roll loosens away from the finger)
 *   phi  the fold's angle
 */
export type CurlPose = { A0: number; Rn: number; Rcap: number; vG: number; H: number; phi: number };

/** How much looser (>1) or tighter (<1) the roll is at distance |v − vG| along the fold from the held point. */
export function bendAt(v: number, vG: number, H: number) {
  'worklet';
  const x = Math.min(1, Math.abs(v - vG) / Math.max(0.8 * H, 1));
  return TIGHT + (LOOSE - TIGHT) * x * x * (3 - 2 * x);
}
export const TIGHT = 0.6;
export const LOOSE = 1.4;

/** One strip's roll: axis position `a` along the fold's normal and radius `R`. Mirrors the shader. */
export function rollAt(p: CurlPose, v: number) {
  'worklet';
  const R = Math.max(0.5, Math.min(p.Rn * bendAt(v, p.vG, p.H), p.Rcap));
  return { a: p.A0 - (Math.PI * R) / 2, R };
}

/**
 * The pose of a single sheet of width W and height H, measured from the middle of its free-standing (left) edge, at turn progress `t`.
 *
 * Paper held at a point G and carried to F folds along the perpendicular bisector of G and F: a point s' that has come over lies at
 * sG + sF − s', so the point that was touched stays under the finger. Before the finger has moved, the held point is the page's leading
 * corner (nothing curls, so nothing jumps when the finger first moves); it hands over to the real grab point within the first few
 * millimetres of travel. Towards the end the sheet is carried a little faster than the finger so that, by the time the pager arrives
 * (t = 1), every strip's roll has passed the far corner and the whole sheet is over.
 */
export function curlGeometry(t: number, width: number, height: number, grab: Grab): CurlPose {
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
  const vG = -gx * sn + gy * c;
  // The tightest strip's radius at the end; every looser strip then clears the far corner too.
  const R1 = width * 0.07 * TIGHT;
  const dEnd = 2 * (sG - sMin) + 2 * R1 - Math.PI * R1;
  const span = Math.max(grab.span, 1);
  // How far the finger has carried the held point along the fold's normal (it moved t·span left and dy down).
  const travel = Math.max(0, t * span * c - grab.dy * sn);
  const D = travel + Math.max(0, dEnd - span) * t * t * t;
  const hold = sG + (sMax - sG) * Math.exp(-D / (0.12 * width));
  // The roll is fattest mid-turn, like a sheet held loosely.
  return { A0: hold - D / 2, Rn: width * (0.07 + 0.11 * Math.sin(Math.PI * t)), Rcap: D / Math.PI, vG, H: height + width * Math.abs(sn), phi };
}

/**
 * The same for the right-hand page of a two-page spread, measured from the spine S (P = page width). The held point stays under the finger
 * as on a single page, and at t = 1 the mirror line is the spine itself, so the page lands exactly over the left half.
 */
export function spreadGeometry(t: number, S: number, E: number, pageH: number, grab: Grab): CurlPose {
  'worklet';
  const P = Math.max(E - S, 1);
  const phi = foldAngle(t, P, grab) * 0.8;
  const c = Math.cos(phi); const sn = Math.sin(phi);
  const sMax = P * c + (pageH / 2) * Math.abs(sn);
  const gx = Math.max(0.55, Math.min(1, grab.x)) * P;
  const gy = (Math.max(0, Math.min(1, grab.y)) - 0.5) * pageH;
  const sG = gx * c + gy * sn;
  const vG = -gx * sn + gy * c;
  const span = Math.max(grab.span, 1);
  // Landing needs the held point carried to its mirror image across the spine: 2·sG along the (by then upright) normal.
  const dEnd = 2 * sG;
  const travel = Math.max(0, t * span * c - grab.dy * sn);
  const D = Math.max(0, travel + (dEnd - span) * t * t * t);
  const hold = sG + (sMax - sG) * Math.exp(-D / (0.12 * P));
  // Exactly the spine at the end, whatever is left of the hand-over.
  const A0 = t >= 1 ? 0 : hold - D / 2;
  return { A0, Rn: P * (0.03 + 0.15 * Math.sin(Math.PI * t)), Rcap: D / Math.PI, vG, H: pageH + P * Math.abs(sn), phi };
}

/**
 * How far a page lifts when it is pulled past the end of the book (there is no next page). The pull meets more and more resistance and the
 * page never comes more than a fifth of the way over; let go and it falls back. `excess` is how far past the end the finger has gone.
 */
export function endLift(excess: number, width: number) {
  'worklet';
  if (excess <= 0) return 0;
  return 0.2 * (1 - Math.exp(-excess / Math.max(0.5 * width, 1)));
}

/**
 * The paper's stiffness at the start of a drag: the first few points of travel lift the page less than the finger moves, then it follows
 * 1:1 (a constant lag of `give`). Smooth, so there is no step when it takes over.
 */
export function stiff(dx: number, give: number) {
  'worklet';
  const m = Math.abs(dx);
  return Math.sign(dx) * (m - give * (1 - Math.exp(-m / give)));
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
