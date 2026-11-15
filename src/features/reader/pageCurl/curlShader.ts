import { Skia } from '@shopify/react-native-skia';

/**
 * Page curl, drawn per pixel on the GPU.
 *
 * The page being turned is wrapped around a vertical cylinder (radius R) whose axis sits at x = a and travels from the right edge to
 * beyond the left edge as the turn goes from 0 to 1. A screen column x is then one of:
 *   x > a + R   nothing of the sheet is here: the next page shows, with the sheet's shadow falling on it
 *   a ≤ x ≤ a+R the sheet curves over the cylinder. Its far half, now showing the paper's back, is on top; the near half shows the artwork
 *   x < a       flat. The sheet has come right over and lies on its back; where it does not reach, the artwork is still flat on the page
 * Lighting follows the cylinder's surface angle, so the highlight and the dark fold move with the curl.
 */
const SKSL = `
uniform shader fromImg;
uniform shader toImg;
uniform float2 size;
uniform float a;
uniform float R;
uniform float t;
uniform half3 bg;
uniform half3 paper;
uniform float phi;
uniform float4 pageR;

const float PI = 3.14159265;

float hash(float2 p) { return fract(sin(dot(p, float2(12.9898, 78.233))) * 43758.5453); }
half3 opaque(half4 c) { return c.rgb + bg * (1.0 - c.a); }
bool inPage(float2 q) { return q.x >= pageR.x && q.x <= pageR.z && q.y >= pageR.y && q.y <= pageR.w; }
// Distance from a point on the sheet to the sheet's own edge (for the thin bright edge paper has).
float edgeDist(float2 q) { return min(min(q.x - pageR.x, pageR.z - q.x), min(q.y - pageR.y, pageR.w - q.y)); }

half4 main(float2 xy) {
  float W = pageR.z - pageR.x;
  // The fold runs across the page at an angle: the page is lifted by its lower right corner, and the fold straightens as the turn completes.
  // Everything is measured along d, at right angles to the fold.
  float2 d = float2(cos(phi), sin(phi));
  float s = dot(xy - float2(pageR.x, (pageR.y + pageR.w) * 0.5), d);
  float grain = (hash(floor(xy / 1.5)) - 0.5) * 0.03;

  // Next page underneath, in the soft shadow of the sheet above it (less as the sheet lifts away).
  half3 under = opaque(toImg.eval(xy));
  float ex = a + R;
  float leaving = 1.0 - smoothstep(0.82, 1.0, t);
  float shadow = 0.5 * clamp(t * 6.0, 0.0, 1.0) * leaving * exp(-max(s - ex, 0.0) / (0.10 * W));
  if (s > ex) { return half4(under * (1.0 - shadow), 1.0); }

  if (s >= a) {
    float k = clamp((s - a) / R, 0.0, 1.0);
    float th1 = asin(k);
    float2 q2 = xy + (a + (PI - th1) * R - s) * d;   // the far, upper half of the roll: the paper's back
    float2 q1 = xy + (a + th1 * R - s) * d;          // the near half: the artwork curving away
    float facing = sqrt(max(1.0 - k * k, 0.0));
    if (inPage(q2)) {
      half3 col = mix(paper, opaque(fromImg.eval(q2)), 0.16) + grain;
      float lit = 0.6 + 0.4 * facing;
      // A glossy band of reflected light running along the roll, as on a printed sheet.
      float sheen = 0.34 * exp(-pow((k - 0.6) / 0.11, 2.0)) + 0.10 * exp(-pow((k - 0.25) / 0.2, 2.0));
      col = col * lit + half3(sheen);
      col = mix(col, half3(1.0), smoothstep(2.0, 0.0, edgeDist(q2)) * 0.7);
      return half4(col, 1.0);
    }
    if (inPage(q1)) {
      half3 art = opaque(fromImg.eval(q1));
      float lit = 0.48 + 0.52 * cos(th1) - 0.14 * smoothstep(0.55, 1.0, k);
      float sheen = 0.16 * exp(-pow((k - 0.32) / 0.1, 2.0));
      return half4(art * lit + half3(sheen), 1.0);
    }
    return half4(under * (1.0 - shadow), 1.0);
  }

  // Before the roll: where the turned-over part lies, its back shows (mirrored across the fold); elsewhere the page is still flat.
  float2 qb = xy + (2.0 * a + PI * R - 2.0 * s) * d;
  if (inPage(qb)) {
    half3 col = mix(paper, opaque(fromImg.eval(qb)), 0.16) + grain;
    // Light falls off away from the roll, with a faint sheen just after it, and the sheet's cut edge catches the light.
    float away = a - s;
    col *= 1.0 - 0.10 * smoothstep(0.0, 0.5 * W, away);
    col += half3(0.06 * exp(-away / (0.08 * W)));
    col = mix(col, half3(1.0), smoothstep(2.0, 0.0, edgeDist(qb)) * 0.8);
    return half4(col, 1.0);
  }
  // The flat page, with a contact shadow tucked under the roll.
  half3 art = opaque(fromImg.eval(xy));
  float contact = 0.36 * clamp(t * 8.0, 0.0, 1.0) * exp(-(a - s) / (0.05 * W));
  return half4(art * (1.0 - contact), 1.0);
}
`;

/** A shader that fails to compile on some GPU must cost only the effect (the page then just slides), never the app. */
function compile(src: string) {
  try { return Skia.RuntimeEffect.Make(src); } catch { return null; }
}

export const curlEffect = compile(SKSL);

/** The paper colour for the back of the sheet: warm cream on a light reader, a dim warm grey on a dark one, so it never glares. */
export function paperFor(_bg: [number, number, number]): [number, number, number] {
  'worklet';
  // Real comic paper is white whatever the reader's background: the bright back of the sheet is what sells the turn.
  return [0.94, 0.925, 0.89];
}

/**
 * The same curl for a two-page spread, like turning a real book. Only the right-hand page lifts. It rolls around a cylinder that travels from the
 * outer edge to the spine, and lands on the left half showing its back, which is the next spread's left page (a real page has print on both sides).
 * Underneath it, the next spread's right page is uncovered. The four pages are drawn straight from their own images, each placed in its rectangle on
 * screen (left/right of this spread and of the next), so nothing has to be composited ahead of time.
 */
const SPREAD_SKSL = `
uniform shader fromL;
uniform shader fromR;
uniform shader toL;
uniform shader toR;
uniform float4 rFromL;
uniform float4 rFromR;
uniform float4 rToL;
uniform float4 rToR;
uniform float2 size;
uniform float S;
uniform float E;
uniform float a;
uniform float R;
uniform float t;
uniform float phi;
uniform half3 bg;

const float PI = 3.14159265;

bool inside(float4 r, float2 p) { return p.x >= r.x && p.x < r.z && p.y >= r.y && p.y < r.w; }
half3 opaque(half4 c) { return c.rgb + bg * (1.0 - c.a); }
half3 fromAt(float2 p) { if (inside(rFromL, p)) return opaque(fromL.eval(p)); if (inside(rFromR, p)) return opaque(fromR.eval(p)); return bg; }
half3 toAt(float2 p) { if (inside(rToL, p)) return opaque(toL.eval(p)); if (inside(rToR, p)) return opaque(toR.eval(p)); return bg; }
// The turning sheet is the right page; its back (the next left page) is the same rectangle mirrored about the spine.
bool onSheet(float2 q) { return inside(rFromR, q); }
half3 backAt(float2 q) { return toAt(float2(2.0 * S - q.x, q.y)); }
float edgeDist(float2 q) { return min(min(q.x - rFromR.x, rFromR.z - q.x), min(q.y - rFromR.y, rFromR.w - q.y)); }

half4 main(float2 xy) {
  float P = max(E - S, 1.0);
  float2 d = float2(cos(phi), sin(phi));
  float s = dot(xy - float2(S, (rFromR.y + rFromR.w) * 0.5), d);

  half3 base = xy.x >= S ? toAt(xy) : fromAt(xy);
  float leaving = 1.0 - smoothstep(0.8, 1.0, t);
  float ex = a + R;
  float castShade = xy.x >= S ? 0.45 * clamp(t * 6.0, 0.0, 1.0) * leaving * exp(-max(s - ex, 0.0) / (0.11 * P)) : 0.0;
  if (s > ex) return half4(base * (1.0 - castShade), 1.0);

  if (s >= a) {
    float k = clamp((s - a) / R, 0.0, 1.0);
    float th1 = asin(k);
    float2 q2 = xy + (a + (PI - th1) * R - s) * d;
    float2 q1 = xy + (a + th1 * R - s) * d;
    float facing = sqrt(max(1.0 - k * k, 0.0));
    if (onSheet(q2)) {
      half3 col = backAt(q2) * (0.6 + 0.4 * facing);
      col += half3(0.30 * exp(-pow((k - 0.6) / 0.11, 2.0)) + 0.08 * exp(-pow((k - 0.25) / 0.2, 2.0)));
      col = mix(col, half3(1.0), smoothstep(2.0, 0.0, edgeDist(q2)) * 0.6);
      return half4(col, 1.0);
    }
    if (onSheet(q1)) {
      half3 art = fromAt(q1);
      float lit = 0.48 + 0.52 * cos(th1) - 0.14 * smoothstep(0.55, 1.0, k);
      return half4(art * lit + half3(0.14 * exp(-pow((k - 0.32) / 0.1, 2.0))), 1.0);
    }
    return half4(base * (1.0 - castShade), 1.0);
  }

  float2 qb = xy + (2.0 * a + PI * R - 2.0 * s) * d;
  if (onSheet(qb)) {
    float away = a - s;
    half3 back = backAt(qb) * (1.0 - 0.08 * smoothstep(0.0, 0.5 * P, away));
    back += half3(0.05 * exp(-away / (0.08 * P)));
    back = mix(back, half3(0.97), smoothstep(2.0, 0.0, edgeDist(qb)) * 0.6);
    return half4(back, 1.0);
  }
  // Uncovered: this spread's pages, with a contact shadow under the roll and a soft shade ahead of where the sheet lands on the left.
  float contact = xy.x >= S ? 0.32 * clamp(t * 8.0, 0.0, 1.0) * exp(-(a - s) / (0.05 * P)) : 0.0;
  float landing = 2.0 * a + PI * R;
  float land = xy.x < S ? 0.35 * clamp(t * 4.0, 0.0, 1.0) * exp(-max(s - landing, 0.0) / (0.06 * P)) * step(landing, s) : 0.0;
  return half4(fromAt(xy) * (1.0 - contact - land), 1.0);
}
`;

export const spreadCurlEffect = compile(SPREAD_SKSL);

export { curlGeometry, foldAngle, spreadGeometry, type Grab } from './curlMath';
