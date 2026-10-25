import { describe, expect, it } from 'vitest';
import { excludedLine, hasRereadable, INTENT_CHIPS, intentNote, primaryAction, roleBadge } from './readView';
import type { Evidence, ReadDecision } from '../../lib/engines/compare/decide/types';

const block: Evidence = { type: 'earlier_unread', polarity: 'block', strength: 'major', data: { previous: 'Volume One' }, text: '' };

describe('roleBadge', () => {
  it('describes the job, not the rank', () => {
    expect(roleBadge({ role: 'read_now', blockers: [] })).toEqual({ label: 'READ NOW', tone: 'go' });
    expect(roleBadge({ role: 'detour', blockers: [] }).label).toBe('DETOUR');
    expect(roleBadge({ role: 'read_after', blockers: [] }).label).toBe('READ AFTER');
    expect(roleBadge({ role: 'later', blockers: [] }).label).toBe('LATER');
  });
  it('names the book that has to come first', () => {
    expect(roleBadge({ role: 'blocked', blockers: [block] })).toEqual({ label: 'READ VOLUME ONE FIRST', tone: 'wait' });
    expect(roleBadge({ role: 'get_first', blockers: [] }).tone).toBe('wait');
  });
  it('never repeats the same label for different roles (no "Read Next" twice)', () => {
    const labels = (['read_now', 'read_after', 'detour', 'later', 'get_first'] as const).map((role) => roleBadge({ role, blockers: [] }).label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('labels', () => {
  it('offers exactly the five tonight-intents, best overall first', () => {
    expect(INTENT_CHIPS.map((c) => c.id)).toEqual(['best', 'continue_path', 'darkest', 'short', 'different']);
  });
  it('explains a reshaped ranking, and is silent for the default', () => {
    expect(intentNote('best')).toBeNull();
    for (const i of ['continue_path', 'darkest', 'short', 'different'] as const) expect(intentNote(i)).toMatch(/^Ranked /);
  });
  it('explains excluded books instead of ranking them', () => {
    expect(excludedLine({ workId: 'x', title: 'X', reason: 'already_finished', canReread: true })).toBe('✓ Already finished');
    expect(excludedLine({ workId: 'x', title: 'X', reason: 'dropped', canReread: false })).toBe('Set aside');
  });
});

describe('actions', () => {
  const base = { excluded: [], order: [] } as unknown as ReadDecision;
  it('only offers rereads when something finished can be reread', () => {
    expect(hasRereadable(base)).toBe(false);
    expect(hasRereadable({ ...base, excluded: [{ workId: 'a', title: 'A', reason: 'already_finished', canReread: true }] } as ReadDecision)).toBe(true);
    expect(hasRereadable({ ...base, excluded: [{ workId: 'a', title: 'A', reason: 'dropped', canReread: false }] } as ReadDecision)).toBe(false);
  });
  it('labels the primary action by whether it can be read tonight', () => {
    const d = (tier: 0 | 1, isReread = false) => ({ order: [{ tier, isReread }] }) as unknown as ReadDecision;
    expect(primaryAction(d(0))).toBe('Start reading');
    expect(primaryAction(d(0, true))).toBe('Reread it');
    expect(primaryAction(d(1))).toBe('See how to read it');
    expect(primaryAction({ order: [] } as unknown as ReadDecision)).toBe('');
  });
});
