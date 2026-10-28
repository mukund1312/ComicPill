import { describe, expect, it } from 'vitest';
import { blockText, groupIntoBlocks, layoutPage, mergeRegions, orderBlocks, tileRects, type OcrLine, type OcrRegion } from './layout';
import page40 from './__fixtures__/flash-page-40.json';
import page120 from './__fixtures__/flash-page-120.json';

const line = (text: string, x: number, y: number, w = 0.2, h = 0.012): OcrLine => ({ text, x, y, w, h });

describe('tileRects', () => {
  it('covers the whole page with overlapping tiles', () => {
    const tiles = tileRects(2000, 3000, 3, 2);
    expect(tiles).toHaveLength(6);
    expect(Math.min(...tiles.map((t) => t.x))).toBe(0);
    expect(Math.max(...tiles.map((t) => t.x + t.w))).toBe(2000);
    expect(Math.max(...tiles.map((t) => t.y + t.h))).toBe(3000);
    expect(tiles[0].x + tiles[0].w).toBeGreaterThan(tiles[1].x); // neighbours overlap
  });
});

describe('mergeRegions', () => {
  it('keeps one copy of a line read twice and prefers the complete one', () => {
    const whole: OcrRegion = { rect: { x: 0, y: 0, w: 1000, h: 1000 }, lines: [line('DOING HERE IS SO FAR', 0.4, 0.2, 0.3)] };
    const tile: OcrRegion = { rect: { x: 0, y: 0, w: 500, h: 500 }, lines: [line('ere is so far', 0.8, 0.4, 0.2)] }; // the same words, cut by the tile's right edge
    expect(mergeRegions([tile, whole], 1000, 1000).map((l) => l.text)).toEqual(['DOING HERE IS SO FAR']);
  });
  it('keeps a line only a tile could see, and drops stray marks', () => {
    const whole: OcrRegion = { rect: { x: 0, y: 0, w: 1000, h: 1000 }, lines: [] };
    const tile: OcrRegion = { rect: { x: 0, y: 500, w: 1000, h: 500 }, lines: [line('FREAK!', 0.3, 0.3), line('~', 0.6, 0.6)] };
    expect(mergeRegions([whole, tile], 1000, 1000).map((l) => l.text)).toEqual(['FREAK!']);
  });
});

describe('groupIntoBlocks and orderBlocks', () => {
  it('joins stacked lines into one balloon and keeps separate balloons apart', () => {
    const blocks = groupIntoBlocks([line('THEY ONLY', 0.1, 0.1), line('WANT WEAPONS,', 0.1, 0.115), line('JUST FINE-TUNING', 0.6, 0.1)]);
    expect(blocks.map(blockText).sort()).toEqual(['JUST FINE-TUNING', 'THEY ONLY WANT WEAPONS,']);
  });
  it('reads rows top to bottom and each row left to right, or right to left for manga', () => {
    const a = [line('A', 0.1, 0.1)]; const b = [line('B', 0.6, 0.1)]; const c = [line('C', 0.1, 0.5)];
    expect(orderBlocks([c, b, a], false).map(blockText)).toEqual(['A', 'B', 'C']);
    expect(orderBlocks([c, b, a], true).map(blockText)).toEqual(['B', 'A', 'C']);
  });
  it('reads one panel’s balloons top to bottom before moving to the next panel beside it', () => {
    // The balloons of the two panels interleave in height, so no gap runs across the page: only the gutter between the panels separates them.
    const l1 = [line('L1', 0.1, 0.100)]; const l2 = [line('L2', 0.1, 0.115)]; const r1 = [line('R1', 0.6, 0.105)]; const r2 = [line('R2', 0.6, 0.120)];
    expect(orderBlocks([r2, l2, r1, l1], false).map(blockText)).toEqual(['L1', 'L2', 'R1', 'R2']);
    expect(orderBlocks([r2, l2, r1, l1], true).map(blockText)).toEqual(['R1', 'R2', 'L1', 'L2']);
  });
  it('puts a word split across lines back together', () => {
    expect(blockText([line('BEYOND WHAT THE GOVERNMENT CAN COM-', 0, 0), line('PREHEND.', 0, 0.02)])).toBe('BEYOND WHAT THE GOVERNMENT CAN COMPREHEND.');
    expect(blockText([line('PAGE ONE--', 0, 0), line('TWO', 0, 0.02)])).toBe('PAGE ONE-- TWO');
  });
});

describe('a real page (Absolute Flash, page 40)', () => {
  const result = layoutPage((page40 as { regions: OcrRegion[] }).regions, page40.width, page40.height);
  const at = (phrase: string) => result.text.toUpperCase().indexOf(phrase);

  it('lists the balloons in the order they are read, panel by panel', () => {
    const order = ['THEY ONLY WANT WEAPONS', 'WHAT WE ARE DOING HERE', 'SPEAKING OF WHICH', 'JUST FINE-TUNING', "I'LL BE READY", 'YES, ABOUT THAT', 'WHAT?!',
      'YOU KNOW WHAT HAPPENED', 'DANGEROUS, BARRY', 'YOU LEAD THE TEAM', 'BUT OUR EQUIPMENT', "AND ONCE WE'RE SURE", 'TOGETHER, BARRY'].map(at);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('has each line once, and the words that only the tiles could read', () => {
    const upper = result.text.toUpperCase();
    expect(upper.split('SO FAR').length - 1).toBe(1);
    expect(upper).toContain('TOGETHER');
    expect(upper).toContain('GOVERNMENT CAN COMPREHEND'); // a tile that read two lines as one must not swallow the real lines
  });
});

describe('a real page the whole-page read missed entirely (page 120)', () => {
  it('still produces text from the tiles', () => {
    const regions = (page120 as { regions: OcrRegion[] }).regions;
    expect(regions[0].lines).toHaveLength(0);
    expect(layoutPage(regions, page120.width, page120.height).text.length).toBeGreaterThan(10);
  });
});
