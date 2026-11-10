import { describe, expect, it } from 'vitest';
import { bubblesFromDetections } from './fromModel';

const d = (c: number, s: number, x: number, y: number, w: number, h: number) => ({ c, s, x, y, w, h });

describe('bubblesFromDetections', () => {
  it('keeps balloons, drops weak boxes and lettering outside balloons, and removes duplicates', () => {
    const out = bubblesFromDetections([d(0, 0.95, 0.1, 0.1, 0.2, 0.08), d(0, 0.2, 0.5, 0.5, 0.2, 0.08), d(2, 0.9, 0.6, 0.6, 0.1, 0.05), d(0, 0.9, 0.101, 0.101, 0.2, 0.08)], false);
    expect(out).toHaveLength(1);
    expect(out[0].x).toBeLessThanOrEqual(0.1); expect(out[0].w).toBeGreaterThanOrEqual(0.2);
  });
  it('reads a page top to bottom, and right to left across a row for manga', () => {
    const boxes = [d(0, 0.9, 0.1, 0.6, 0.2, 0.08), d(0, 0.9, 0.6, 0.1, 0.2, 0.08), d(0, 0.9, 0.1, 0.1, 0.2, 0.08)];
    const ltr = bubblesFromDetections(boxes, false); expect(ltr.map((b) => Math.round(b.y * 10) + ':' + Math.round(b.x * 10))).toEqual(['1:1', '1:6', '6:1']);
    const rtl = bubblesFromDetections(boxes, true); expect(rtl.map((b) => Math.round(b.x * 10))).toEqual([6, 1, 1]);
  });
  it('ignores boxes that are far too big to be a balloon', () => {
    expect(bubblesFromDetections([d(0, 0.99, 0, 0, 0.9, 0.9)], false)).toHaveLength(0);
  });
});
