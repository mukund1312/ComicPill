import { describe, expect, it } from 'vitest';
import { groupBySeries, nextIssue, parseIssueTitle, seriesOf } from './series';

describe('parseIssueTitle', () => {
  it.each([
    ['Saga #012', 'Saga', 12],
    ['Saga 012 (2013)', 'Saga', 12],
    ['Saga v2 012', 'Saga', 12],
    ['Saga_013.cbz', 'Saga', 13],
    ['The Walking Dead - Issue 48', 'The Walking Dead', 48],
    ['Batman No. 5 (Digital) [Zone-Empire]', 'Batman', 5],
    ['One Piece Chapter 1001', 'One Piece', 1001],
    ['Hawkeye 007 (of 22)', 'Hawkeye', 7],
    ['Invincible #12.5', 'Invincible', 12.5],
  ])('%s', (title, name, n) => {
    expect(parseIssueTitle(title)).toEqual({ name, number: n });
  });

  it.each(['MidnightSons', 'Watchmen (1986)', 'Spider-Man 2099', 'Test', '2001'])('%s is not an issue', (title) => {
    expect(parseIssueTitle(title)).toBeNull();
  });
});

describe('seriesOf', () => {
  it('prefers the file’s own series and number', () => {
    expect(seriesOf({ id: 'a', title: 'Whatever', series: 'Saga', issue: '7' })).toEqual({ key: 'saga', name: 'Saga', number: 7 });
  });
  it('groups names that differ only in case, punctuation or a leading The', () => {
    expect(seriesOf({ id: 'a', title: 'The Walking Dead #1' })!.key).toBe(seriesOf({ id: 'b', title: 'walking dead 002' })!.key);
  });
});

describe('groupBySeries', () => {
  const shelf = [
    { id: '1', title: 'Saga #3' },
    { id: '2', title: 'MidnightSons' },
    { id: '3', title: 'Saga #1' },
    { id: '4', title: 'Hawkeye #1' },
    { id: '5', title: 'Saga #2' },
  ];
  it('makes a series of two or more issues, in issue order, where its first comic was', () => {
    const g = groupBySeries(shelf);
    expect(g.map((x) => (x.kind === 'series' ? `S:${x.group.name}` : x.comic.title))).toEqual(['S:Saga', 'MidnightSons', 'Hawkeye #1']);
    const saga = g[0];
    expect(saga.kind === 'series' && saga.group.issues.map((i) => i.id)).toEqual(['3', '5', '1']);
  });
});

describe('nextIssue', () => {
  const shelf = [{ id: 'a', title: 'Saga #1' }, { id: 'b', title: 'Saga #3' }, { id: 'c', title: 'Saga #2' }, { id: 'd', title: 'Other #2' }];
  it('finds the next number in the same series', () => {
    expect(nextIssue(shelf[0], shelf)?.id).toBe('c');
    expect(nextIssue(shelf[2], shelf)?.id).toBe('b');
  });
  it('is null at the end of the run or for a one-off', () => {
    expect(nextIssue(shelf[1], shelf)).toBeNull();
    expect(nextIssue({ id: 'x', title: 'MidnightSons' }, shelf)).toBeNull();
  });
});
