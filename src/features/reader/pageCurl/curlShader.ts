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

export const curlEffect = Skia.RuntimeEffect.Make(SKSL);

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
