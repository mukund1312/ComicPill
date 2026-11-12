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
uniform float tilt;

float hash(float2 p) { return fract(sin(dot(p, float2(12.9898, 78.233))) * 43758.5453); }

const float PI = 3.14159265;

half3 opaque(half4 c) { return c.rgb + bg * (1.0 - c.a); }

half4 main(float2 xy) {
  float W = size.x;
  float x = xy.x;
  float y = xy.y;
  // The fold is not quite upright: it leans like a page lifted from a lower corner, and straightens as the turn completes.
  float xr = x + tilt * W * (y / size.y - 0.5);
  // A faint paper grain for the back of the sheet.
  float grain = (hash(floor(xy / 1.5)) - 0.5) * 0.035;

  // Next page underneath; it is darkened by the sheet above it, less so as the sheet lifts away.
  half3 under = opaque(toImg.eval(xy));
  float ex = a + R;
  float leaving = 1.0 - smoothstep(0.82, 1.0, t);
  float shadow = 0.42 * clamp(t * 6.0, 0.0, 1.0) * leaving * exp(-max(xr - ex, 0.0) / (0.11 * W));
  if (xr > ex) { return half4(under * (1.0 - shadow), 1.0); }

  if (xr >= a) {
    float s = clamp((xr - a) / R, 0.0, 1.0);
    float th1 = asin(s);
    float u1 = a + th1 * R;
    float u2 = a + (PI - th1) * R;
    if (u2 <= W) {
      // The far half of the cylinder: the back of the paper, lit more as it faces us.
      half3 art = opaque(fromImg.eval(float2(u2, y)));
      half3 col = (mix(paper, art, 0.13) + grain) * 0.985;
      float facing = sqrt(max(1.0 - s * s, 0.0));
      float lit = 0.55 + 0.45 * facing + 0.17 * exp(-pow((s - 0.5) / 0.18, 2.0));
      return half4(col * lit, 1.0);
    }
    if (u1 <= W) {
      // The near half: the artwork curving away, darker as it turns from the light, with a soft dark line where it leaves the page.
      half3 art = opaque(fromImg.eval(float2(u1, y)));
      float lit = 0.5 + 0.5 * cos(th1) - 0.12 * smoothstep(0.5, 1.0, s);
      return half4(art * lit, 1.0);
    }
    return half4(under * (1.0 - shadow), 1.0);
  }

  // Flat part, left of the cylinder.
  float ub = 2.0 * a + PI * R - xr;
  if (ub <= W) {
    half3 art = opaque(fromImg.eval(float2(ub, y)));
    half3 col = (mix(paper, art, 0.13) + grain) * 0.985;
    // Gently darker the further the flat sheet lies from the fold.
    col *= 1.0 - 0.09 * smoothstep(0.0, 0.5 * W, a - xr);
    // The sheet's own edge: a thin bright line, as paper has thickness.
    float edge = smoothstep(W - 2.0, W, ub);
    col = mix(col, half3(0.99), edge * 0.85);
    return half4(col, 1.0);
  }
  half3 art = opaque(fromImg.eval(xy));
  float contact = 0.30 * clamp(t * 8.0, 0.0, 1.0) * exp(-(a - xr) / (0.06 * W));
  return half4(art * (1.0 - contact), 1.0);
}
`;

/** A shader that fails to compile on some GPU must cost only the effect (the page then just slides), never the app. */
function compile(src: string) {
  try { return Skia.RuntimeEffect.Make(src); } catch { return null; }
}

export const curlEffect = compile(SKSL);

/** Where the cylinder is, and how fat, at turn progress `t` (0 = flat, 1 = gone off the left edge). */
/** The paper colour for the back of the sheet: warm cream on a light reader, a dim warm grey on a dark one, so it never glares. */
export function paperFor(bg: [number, number, number]): [number, number, number] {
  'worklet';
  const lum = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
  return lum > 0.5 ? [0.945, 0.925, 0.875] : [0.20 + bg[0] * 0.3, 0.19 + bg[1] * 0.3, 0.17 + bg[2] * 0.3];
}

export function curlGeometry(t: number, width: number) {
  'worklet';
  const R = width * (0.1 + 0.1 * Math.sin(Math.PI * t));
  const a = width - t * (width + 2 * R);
  return { a, R };
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
uniform float tilt;
uniform half3 bg;

const float PI = 3.14159265;

bool inside(float4 r, float2 p) { return p.x >= r.x && p.x < r.z && p.y >= r.y && p.y < r.w; }
half3 opaque(half4 c) { return c.rgb + bg * (1.0 - c.a); }
half3 fromAt(float2 p) { if (inside(rFromL, p)) return opaque(fromL.eval(p)); if (inside(rFromR, p)) return opaque(fromR.eval(p)); return bg; }
half3 toAt(float2 p) { if (inside(rToL, p)) return opaque(toL.eval(p)); if (inside(rToR, p)) return opaque(toR.eval(p)); return bg; }

half4 main(float2 xy) {
  float x = xy.x;
  float y = xy.y;
  float P = max(E - S, 1.0);
  // The fold leans as if the page were lifted by its lower corner, and straightens as it lands.
  float xr = x + tilt * P * (y / size.y - 0.5);
  float ex = a + R;

  // Not under the sheet: the next spread's right page to the right of the spine, this spread's left page to the left of it.
  half3 base = x >= S ? toAt(xy) : fromAt(xy);
  // The lifted sheet throws a soft shadow on the page it is uncovering.
  float leaving = 1.0 - smoothstep(0.8, 1.0, t);
  float castShade = x >= S ? 0.40 * clamp(t * 6.0, 0.0, 1.0) * leaving * exp(-max(xr - ex, 0.0) / (0.12 * P)) : 0.0;
  if (xr > ex) return half4(base * (1.0 - castShade), 1.0);

  if (xr >= a) {
    float s = clamp((xr - a) / R, 0.0, 1.0);
    float th1 = asin(s);
    float u1 = a + th1 * R;
    float u2 = a + (PI - th1) * R;
    if (u2 <= E && u2 >= S) {
      // The far half of the roll: the back of the page (the next left page), brighter where it faces us.
      half3 back = toAt(float2(2.0 * S - u2, y));
      float facing = sqrt(max(1.0 - s * s, 0.0));
      float lit = 0.55 + 0.45 * facing + 0.15 * exp(-pow((s - 0.5) / 0.18, 2.0));
      return half4(back * lit, 1.0);
    }
    if (u1 <= E && u1 >= S) {
      // The near half: this page's art curving away from the light, with a dark line where it leaves the paper.
      half3 art = fromAt(float2(u1, y));
      float lit = 0.5 + 0.5 * cos(th1) - 0.12 * smoothstep(0.5, 1.0, s);
      return half4(art * lit, 1.0);
    }
    return half4(base * (1.0 - castShade), 1.0);
  }

  // Left of the roll. Where the turned-over part lies, its back shows (mirrored about the spine, exactly where it will rest).
  float ub = 2.0 * a + PI * R - xr;
  if (ub <= E && ub >= S) {
    half3 back = toAt(float2(2.0 * S - ub, y));
    back *= 1.0 - 0.08 * smoothstep(0.0, 0.5 * P, a - xr);
    float edge = smoothstep(E - 2.0, E, ub);
    back = mix(back, half3(0.95), edge * 0.6);
    return half4(back, 1.0);
  }
  // Uncovered: the flat rest of this page right of the spine, or the left page, darkened a little just ahead of the landing edge.
  float landing = 2.0 * a + PI * R - E;
  float shade = x < S ? 0.35 * clamp(t * 4.0, 0.0, 1.0) * exp(-max(x - landing, 0.0) / (0.06 * P)) * step(landing, x) : 0.30 * clamp(t * 8.0, 0.0, 1.0) * exp(-(a - xr) / (0.06 * P));
  return half4(fromAt(xy) * (1.0 - shade), 1.0);
}
`;

export const spreadCurlEffect = compile(SPREAD_SKSL);

/** The roll for a spread: it starts at the outer edge `E`, ends at the spine `S` (thin again), and is fattest half-way. */
export function spreadGeometry(t: number, S: number, E: number) {
  'worklet';
  const P = E - S;
  const R = P * (0.02 + 0.16 * Math.sin(Math.PI * t));
  // At t = 1 the turned page lies mirrored about the spine: 2a + πR = 2S.
  const a = E - t * (E - S) - t * ((Math.PI * R) / 2);
  return { a, R };
}
