import { describe, expect, it } from 'vitest';
import { makeSerialQueue, MAX_EMPTY_PAGES_SKIPPED, nextSide, positionForMode, stepForSide, stepForVolume, stepPosition, type ItemCounter } from './readerNav';

const counts = (n: number[]): ItemCounter => async (p) => n[p] ?? 0;

describe('which way is Next', () => {
  it('LTR: right is forward, left is back. RTL: left is forward, right is back', () => {
    expect(stepForSide('right', 'ltr')).toBe(1); expect(stepForSide('left', 'ltr')).toBe(-1);
    expect(stepForSide('left', 'rtl')).toBe(1); expect(stepForSide('right', 'rtl')).toBe(-1);
    expect(nextSide('ltr')).toBe('right'); expect(nextSide('rtl')).toBe('left');
  });
  it('volume Up is Next and Down is Previous in both directions', () => {
    expect(stepForVolume('up')).toBe(1); expect(stepForVolume('down')).toBe(-1);
  });
});

describe('page mode', () => {
  const go = (page: number, d: 1 | -1) => stepPosition({ page, index: 0 }, d, 'page', 5, counts([]));
  it('steps one page and stops at both ends', async () => {
    expect(await go(2, 1)).toEqual({ kind: 'moved', position: { page: 3, index: 0 }, crossedPage: true });
    expect(await go(2, -1)).toEqual({ kind: 'moved', position: { page: 1, index: 0 }, crossedPage: true });
    expect(await go(4, 1)).toEqual({ kind: 'edge' }); expect(await go(0, -1)).toEqual({ kind: 'edge' });
  });
});

describe.each(['panel', 'bubble'] as const)('%s mode', (mode) => {
  const items = counts([3, 2, 4]);
  const go = (page: number, index: number, d: 1 | -1) => stepPosition({ page, index }, d, mode, 3, items);
  it('moves inside a page', async () => {
    expect(await go(0, 0, 1)).toEqual({ kind: 'moved', position: { page: 0, index: 1 }, crossedPage: false });
    expect(await go(0, 2, -1)).toEqual({ kind: 'moved', position: { page: 0, index: 1 }, crossedPage: false });
  });
  it('last item goes to the first of the next page, first item goes to the last of the previous', async () => {
    expect(await go(0, 2, 1)).toEqual({ kind: 'moved', position: { page: 1, index: 0 }, crossedPage: true });
    expect(await go(1, 0, -1)).toEqual({ kind: 'moved', position: { page: 0, index: 2 }, crossedPage: true });
    expect(await go(2, 0, -1)).toEqual({ kind: 'moved', position: { page: 1, index: 1 }, crossedPage: true });
  });
  it('stops at the very first and last item of the comic', async () => {
    expect(await go(2, 3, 1)).toEqual({ kind: 'edge' }); expect(await go(0, 0, -1)).toEqual({ kind: 'edge' });
  });
  it('walks the whole comic forward then back without skipping or repeating a position', async () => {
    const seen: string[] = []; let at = { page: 0, index: 0 }; seen.push('0.0');
    for (;;) { const r = await go(at.page, at.index, 1); if (r.kind === 'edge') break; at = r.position; seen.push(`${at.page}.${at.index}`); }
    expect(seen).toEqual(['0.0', '0.1', '0.2', '1.0', '1.1', '2.0', '2.1', '2.2', '2.3']);
    const back: string[] = [];
    for (;;) { const r = await go(at.page, at.index, -1); if (r.kind === 'edge') break; at = r.position; back.push(`${at.page}.${at.index}`); }
    expect(back).toEqual(['2.2', '2.1', '2.0', '1.1', '1.0', '0.2', '0.1', '0.0']);
  });
  it('passes over pages with nothing to read', async () => {
    const sparse = counts([2, 0, 0, 3]);
    expect(await stepPosition({ page: 0, index: 1 }, 1, mode, 4, sparse)).toEqual({ kind: 'moved', position: { page: 3, index: 0 }, crossedPage: true });
    expect(await stepPosition({ page: 3, index: 0 }, -1, mode, 4, sparse)).toEqual({ kind: 'moved', position: { page: 0, index: 1 }, crossedPage: true });
  });
  it('is at the edge when nothing at all lies ahead', async () => {
    expect(await stepPosition({ page: 0, index: 1 }, 1, mode, 3, counts([2, 0, 0]))).toEqual({ kind: 'edge' });
  });
  it('does not search forever through a long run of empty pages', async () => {
    const calls: number[] = []; const long: ItemCounter = async (p) => { calls.push(p); return p === 0 ? 1 : 0; };
    const r = await stepPosition({ page: 0, index: 0 }, 1, mode, 100, long);
    expect(r.kind).toBe('moved'); expect(calls.length).toBeLessThanOrEqual(MAX_EMPTY_PAGES_SKIPPED + 2);
  });
  it('clamps a stale position instead of throwing', async () => {
    expect(await stepPosition({ page: 0, index: 99 }, -1, mode, 3, items)).toEqual({ kind: 'moved', position: { page: 0, index: 1 }, crossedPage: false });
  });
});

describe('switching reading mode', () => {
  it('keeps the page, and the item only when the new mode remembers one on that page', () => {
    expect(positionForMode({ page: 7, index: 3 }, 'page', {})).toEqual({ page: 7, index: 0 });
    expect(positionForMode({ page: 7, index: 0 }, 'panel', { panel: { page: 7, index: 3 } })).toEqual({ page: 7, index: 3 });
    expect(positionForMode({ page: 8, index: 0 }, 'panel', { panel: { page: 7, index: 3 } })).toEqual({ page: 8, index: 0 });
  });
});

describe('serial queue', () => {
  it('runs presses in order, one at a time, and keeps only a few waiting', async () => {
    const q = makeSerialQueue(2); const log: string[] = []; let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    q(async () => { log.push('a:start'); await gate; log.push('a:end'); });
    q(async () => { log.push('b'); }); q(async () => { log.push('c'); }); q(async () => { log.push('dropped'); });
    expect(log).toEqual(['a:start']);
    release(); await new Promise((r) => setTimeout(r, 10));
    expect(log).toEqual(['a:start', 'a:end', 'b', 'c']);
  });
});
