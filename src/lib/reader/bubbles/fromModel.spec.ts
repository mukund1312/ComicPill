import { describe, expect, it } from 'vitest';
import { bubblesFromDetections } from './fromModel';

const d = (c: number, s: number, x: number, y: number, w: number, h: number) => ({ c, s, x, y, w, h });

describe('bubblesFromDetections', () => {
  it('keeps balloons, drops weak boxes and duplicates, and marks lettering outside balloons as a sound effect', () => {
    const out = bubblesFromDetections([d(0, 0.95, 0.1, 0.1, 0.2, 0.08), d(0, 0.2, 0.5, 0.5, 0.2, 0.08), d(2, 0.9, 0.6, 0.6, 0.1, 0.05), d(0, 0.9, 0.101, 0.101, 0.2, 0.08)], false);
    const balloons = out.filter((b) => !b.sfx);
    expect(balloons).toHaveLength(1); // weak box and the duplicate gone
    expect(balloons[0].x).toBeLessThanOrEqual(0.1); expect(balloons[0].w).toBeGreaterThanOrEqual(0.2);
    expect(out.filter((b) => b.sfx)).toHaveLength(1); // the lettering outside the balloon is kept, marked as a sound effect
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

import { splitStacked } from './fromModel';

describe('splitStacked', () => {
  const balloon = d(0, 0.95, 0.4, 0.2, 0.3, 0.3);
  it('cuts one box that holds two stacked balloons into two, between their lettering', () => {
    const out = splitStacked(balloon, [d(1, 0.9, 0.45, 0.22, 0.2, 0.05), d(1, 0.9, 0.45, 0.28, 0.2, 0.05), d(1, 0.9, 0.45, 0.40, 0.2, 0.05), d(1, 0.9, 0.45, 0.46, 0.2, 0.04)]);
    expect(out).toHaveLength(2);
    expect(out[0].y + out[0].h).toBeCloseTo(out[1].y, 6);
    expect(out[0].y + out[0].h).toBeGreaterThan(0.33); expect(out[0].y + out[0].h).toBeLessThan(0.40);
  });
  it('leaves a balloon with several close lines of lettering alone', () => {
    expect(splitStacked(balloon, [d(1, 0.9, 0.45, 0.22, 0.2, 0.05), d(1, 0.9, 0.45, 0.28, 0.2, 0.05), d(1, 0.9, 0.45, 0.34, 0.2, 0.05)])).toHaveLength(1);
  });
});

describe('sound effects', () => {
  it('keeps lettering outside balloons as marked sound effects, and drops lettering that sits inside a balloon', () => {
    const out = bubblesFromDetections([d(0, 0.95, 0.1, 0.1, 0.3, 0.1), d(2, 0.9, 0.6, 0.6, 0.2, 0.1), d(2, 0.9, 0.12, 0.12, 0.2, 0.06)], false);
    expect(out).toHaveLength(2);
    expect(out.filter((b) => b.sfx)).toHaveLength(1);
    expect(out.find((b) => b.sfx)!.x).toBeGreaterThan(0.5);
  });
  it('ignores weak sound-effect guesses', () => {
    expect(bubblesFromDetections([d(2, 0.45, 0.6, 0.6, 0.2, 0.1)], false)).toHaveLength(0);
  });
});
