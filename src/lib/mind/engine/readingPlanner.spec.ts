import { describe, expect, it } from 'vitest';
import { readingOrder } from './readingPlanner';
import { describeSlot, planWeek } from './weekPlanner';
import type { PrereqEdge, Series } from './types';

const S = (id: string, over: Partial<Series> = {}): Series => ({ id, title: id.toUpperCase(), units: 2, year: 2000, status: 'planned', ...over });
const map = (...list: Series[]) => new Map(list.map((s) => [s.id, s]));
const E = (before: string, after: string, importance: PrereqEdge['importance'] = 'required', over: Partial<PrereqEdge> = {}): PrereqEdge => ({ before, after, importance, confidence: 'verified', ...over });
const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe('readingOrder', () => {
  it('a straight series: oldest first, with the time cost', () => {
    const series = map(S('a', { year: 2001 }), S('b', { year: 2003 }), S('c', { year: 2005 }), S('d'));
    const order = readingOrder('d', series, [E('a', 'b'), E('b', 'c'), E('c', 'd')]);
    expect(ids(order.readFirst)).toEqual(['a', 'b', 'c']);
    expect(order.unitsToRead).toBe(6);
  });

  it('a branching universe: both required branches, helpful ones after, optional never', () => {
    const series = map(S('base', { year: 1999 }), S('left', { year: 2002 }), S('right', { year: 2001 }), S('helper', { year: 2000 }), S('skip'), S('target', { year: 2010 }));
    const order = readingOrder('target', series, [E('base', 'left'), E('base', 'right'), E('left', 'target'), E('right', 'target'), E('helper', 'target', 'helpful'), E('skip', 'target', 'optional')]);
    expect(ids(order.readFirst)).toEqual(['base', 'right', 'left', 'helper']);
    expect(ids(order.readFirst)).not.toContain('skip');
  });

  it('a loop must not hang, and still returns the titles in it', () => {
    const series = map(S('x'), S('y'), S('z'));
    const order = readingOrder('z', series, [E('x', 'y'), E('y', 'x'), E('y', 'z')]);
    expect(new Set(ids(order.readFirst))).toEqual(new Set(['x', 'y']));
  });

  it('a title that requires itself does not loop', () => {
    expect(readingOrder('a', map(S('a')), [E('a', 'a')]).readFirst).toEqual([]);
  });

  it('finished and dropped prerequisites leave the list (mark-as-read updates the plan)', () => {
    const series = map(S('a', { status: 'finished' }), S('b'), S('c', { status: 'dropped' }), S('t'));
    const order = readingOrder('t', series, [E('a', 'b'), E('b', 't'), E('c', 't', 'helpful')]);
    expect(ids(order.readFirst)).toEqual(['b']);
    expect(order.unitsToRead).toBe(2);
  });

  it('"looks wrong" edges are ignored', () => {
    const order = readingOrder('t', map(S('a'), S('t')), [E('a', 't', 'required', { confidence: 'ai_suggested', wrong: true })]);
    expect(order.readFirst).toEqual([]);
  });

  it('"then" goes two steps on, required before helpful, never optional', () => {
    const series = map(S('t'), S('n1'), S('n2'), S('n3'), S('h1'), S('o1'));
    const order = readingOrder('t', series, [E('t', 'n1'), E('n1', 'n2'), E('n2', 'n3'), E('t', 'h1', 'helpful'), E('t', 'o1', 'optional')]);
    expect(ids(order.then)).toEqual(['n1', 'h1', 'n2']);
  });

  it('carries the confidence tag through', () => {
    const order = readingOrder('t', map(S('a'), S('t')), [E('a', 't', 'required', { confidence: 'ai_suggested' })]);
    expect(order.readFirst[0].confidence).toBe('ai_suggested');
  });
});

describe('planWeek', () => {
  const find = (id: string, score: number, readFirst: ReturnType<typeof readingOrder>['readFirst'] = []) => ({
    series: S(id), score, order: { readFirst, then: [], unitsToRead: readFirst.reduce((n, i) => n + i.units, 0) },
  });
  const pre = (id: string, units: number) => ({ id, title: id.toUpperCase(), units, importance: 'required' as const, confidence: 'verified' as const, status: 'planned' as const });

  it('puts prerequisites before the title, highest score first', () => {
    const plan = planWeek([find('low', 50), find('high', 90, [pre('p', 2)])], 5, 1);
    expect(plan.slots.map((s) => `${s.kind}:${s.seriesId}`)).toEqual(['prerequisite:p', 'start:high', 'start:low']);
    expect(plan.thisWeek).toEqual(['high', 'low']);
    expect(plan.unitsPlanned).toBe(4);
  });

  it('moves what does not fit to Up next, but still reads the prerequisites that fit', () => {
    const plan = planWeek([find('a', 90, [pre('p', 3)]), find('b', 60)], 2, 0);
    expect(plan.thisWeek).toEqual([]);
    expect(plan.upNext).toEqual(['a', 'b']);
    expect(plan.slots).toHaveLength(1);
    expect(plan.slots[0]).toMatchObject({ seriesId: 'p', fromUnit: 1, toUnit: 2 });
  });

  it('reads a shared prerequisite once', () => {
    const plan = planWeek([find('a', 90, [pre('p', 1)]), find('b', 80, [pre('p', 1)])], 10, 0);
    expect(plan.slots.filter((s) => s.seriesId === 'p')).toHaveLength(1);
  });

  it('names the days, starting from the given weekday', () => {
    const plan = planWeek([find('a', 90, [pre('p', 4)])], 7, 1, 7); // starts Monday, 1 unit a day
    expect(plan.slots[0]).toMatchObject({ startDay: 'Monday', endDay: 'Thursday' });
    expect(describeSlot(plan.slots[0])).toBe('Read P vol. 1–4 by Thursday');
    expect(describeSlot(plan.slots[1])).toBe('Start A on Friday');
  });

  it('zero capacity plans nothing and everything waits', () => {
    const plan = planWeek([find('a', 90)], 0, 0);
    expect(plan.slots).toEqual([]);
    expect(plan.upNext).toEqual(['a']);
  });
});
