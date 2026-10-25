import { describe, expect, it } from 'vitest';
import { decodeBase64, detectPanels, FULL_PAGE } from './panels';

type Rect = [number, number, number, number]; // x0,y0,x1,y1 in pixels

/** A page: gutter colour everywhere, mid-gray "art" inside each rect, with a coloured border inside the art. */
function page(w: number, h: number, rects: Rect[], bg = 255, art = 110): Uint8Array {
  const g = new Uint8Array(w * h).fill(bg);
  for (const [x0, y0, x1, y1] of rects) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g[y * w + x] = art + ((x + y) % 40); // textured art
  return g;
}

const W = 100; const H = 150;
const grid: Rect[] = [[6, 6, 47, 72], [53, 6, 94, 72], [6, 78, 47, 144], [53, 78, 94, 144]];

describe('detectPanels', () => {
  it('finds a 2×2 grid in reading order', () => {
    const panels = detectPanels(page(W, H, grid), W, H);
    expect(panels).toHaveLength(4);
    expect(panels.map((p) => [Math.round(p.x * 10), Math.round(p.y * 10)])).toEqual([[1, 0], [5, 0], [1, 5], [5, 5]]);
  });

  it('reads right-to-left inside a row for manga', () => {
    const panels = detectPanels(page(W, H, grid), W, H, { rtl: true });
    expect(panels.map((p) => Math.round(p.x * 10))).toEqual([5, 1, 5, 1]);
    expect(panels[0].y).toBeLessThan(panels[2].y); // still top row first
  });

  it('handles a wide panel over two small ones', () => {
    const rects: Rect[] = [[6, 6, 94, 60], [6, 66, 47, 144], [53, 66, 94, 144]];
    const panels = detectPanels(page(W, H, rects), W, H);
    expect(panels).toHaveLength(3);
    expect(panels[0].w).toBeGreaterThan(0.8);
  });

  it('works on dark gutters', () => {
    const panels = detectPanels(page(W, H, grid, 0, 170), W, H);
    expect(panels).toHaveLength(4);
  });

  it('falls back to the whole page for a splash with no gutters', () => {
    const splash = new Uint8Array(W * H).map((_, i) => 90 + (i % 50));
    expect(detectPanels(splash, W, H)).toEqual([FULL_PAGE]);
  });

  it('falls back to the whole page when only one panel is found', () => {
    expect(detectPanels(page(W, H, [[8, 8, 92, 142]]), W, H)).toEqual([FULL_PAGE]);
  });

  it('ignores specks too small to be panels', () => {
    const rects: Rect[] = [...grid, [48, 73, 51, 76]];
    expect(detectPanels(page(W, H, rects), W, H)).toHaveLength(4);
  });

  it('survives degenerate input', () => {
    expect(detectPanels(new Uint8Array(4), 2, 2)).toEqual([FULL_PAGE]);
  });
});

describe('decodeBase64', () => {
  it('decodes bytes, with and without padding', () => {
    expect(Array.from(decodeBase64('AAEC'))).toEqual([0, 1, 2]);
    expect(Array.from(decodeBase64('/w=='))).toEqual([255]);
    expect(Array.from(decodeBase64('/+8='))).toEqual([255, 239]);
  });
});
