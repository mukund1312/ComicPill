import { describe, expect, it } from 'vitest';
import { guidanceView, relevanceView } from './relevance';
import type { ArcMembership } from '../../lib/engines/arc/membership';
import type { FundVerdict } from '../../lib/engines/fund/verdict';

const titles: Record<string, string> = { 'dark-victory': 'Batman: Dark Victory', 'robin-year-one': 'Robin: Year One' };
const titleOf = (id: string) => titles[id] ?? id;
const member = (over: Partial<ArcMembership> = {}): ArcMembership => ({
  arcId: 'a', arcTitle: 'Batman: From Year One to Legacy', workId: 'robin-year-one', chapterId: 'c', chapterTitle: 'The First Robin',
  milestoneId: 'm', milestoneTitle: 'Dick Grayson enters Bruce’s life', tier: 'recommended', state: 'not_owned', isNext: false,
  previousWorkId: 'dark-victory', percentComplete: 15, ...over,
});
const verdict = (over: Partial<FundVerdict> = {}): FundVerdict => ({
  workId: 'robin-year-one', why: 'A strong next physical addition, worth owning.', wherePaise: 75000, whereRetailerId: 'r',
  canAffordNow: true, impactPaise: 1000, action: 'buy', actionDetail: 'This month', ...over,
});

describe('relevanceView', () => {
  it('says "recommended after X" for a later book (the Discover example)', () => {
    expect(relevanceView(member(), titleOf).line).toBe('Recommended after Batman: Dark Victory.');
  });
  it('says it is the next step when it is', () => {
    const v = relevanceView(member({ isNext: true, workId: 'dark-victory', state: 'owned_unread' }), titleOf);
    expect(v.line).toMatch(/^Your next step: Dick Grayson/);
    expect(v.isNext).toBe(true);
  });
  it('acknowledges a finished book without pushing it', () => {
    const v = relevanceView(member({ state: 'finished' }), titleOf);
    expect(v.line).toMatch(/finished/);
    expect(v.finished).toBe(true);
  });
  it('falls back to the chapter when there is no previous book', () => {
    expect(relevanceView(member({ previousWorkId: null }), titleOf).line).toBe('Part of The First Robin.');
  });
});

describe('guidanceView', () => {
  it('WAIT names the unread book already on the shelf, and never says buy', () => {
    const g = guidanceView({ kind: 'wait', becauseWorkId: 'dark-victory' }, titleOf, verdict());
    expect(g).toEqual({ label: 'WAIT', text: 'You still have Batman: Dark Victory unread. Finish that first.' });
  });
  it('WAIT wins even when the price engine says buy', () => {
    expect(guidanceView({ kind: 'wait', becauseWorkId: 'dark-victory' }, titleOf, verdict({ action: 'buy' }))!.label).toBe('WAIT');
  });
  it.each([
    ['buy', 'BUY'], ['save', 'SAVE'], ['wait', 'WAIT'], ['skip', 'SKIP'],
  ] as const)('maps the %s verdict to %s when nothing owned stands in the way', (action, label) => {
    expect(guidanceView({ kind: 'consider_buying' }, titleOf, verdict({ action }))!.label).toBe(label);
  });
  it('carries the engine\'s own reasoning', () => {
    expect(guidanceView({ kind: 'consider_buying' }, titleOf, verdict())!.text).toContain('worth owning');
  });
  it('has no advice for books already in hand, finished, or outside the journey', () => {
    for (const kind of ['in_hand', 'done', 'not_in_journey'] as const) expect(guidanceView({ kind }, titleOf, verdict())).toBeNull();
  });
  it('has no advice when it should consider buying but there is no verdict yet', () => {
    expect(guidanceView({ kind: 'consider_buying' }, titleOf, null)).toBeNull();
  });
  it('has no advice for an already-owned verdict', () => {
    expect(guidanceView({ kind: 'consider_buying' }, titleOf, verdict({ action: 'owned' }))).toBeNull();
  });
});
