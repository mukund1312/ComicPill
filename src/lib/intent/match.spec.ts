import { describe, expect, it } from 'vitest';
import { findWorkByTitle, resolveProposals } from './match';
import { CATALOG_WORKS } from '../db/seed/catalog';
import { interpretOffline } from './offline';

const titles = [
  { id: 'wf1', title: 'Batman/Superman: World’s Finest Vol. 1' },
  { id: 'wf2', title: 'Batman/Superman: World’s Finest Vol. 2: Something Longer' },
  { id: 'dv', title: 'Batman: Dark Victory' },
];

describe('findWorkByTitle', () => {
  it('matches across apostrophe styles and prefers the shortest (Vol. 1)', () => {
    expect(findWorkByTitle("World's Finest", titles)?.id).toBe('wf1');
    expect(findWorkByTitle("World's Finest Vol 1", titles)?.id).toBe('wf1');
  });
  it('matches whole words only and ignores trivially short queries', () => {
    expect(findWorkByTitle('Dark', titles)?.id).toBe('dv');
    expect(findWorkByTitle('ar', titles)).toBeNull();
    expect(findWorkByTitle('Victor', titles)).toBeNull();
  });
  it('returns null when nothing matches', () => {
    expect(findWorkByTitle('Watchmen', titles)).toBeNull();
  });
  it('finds the real World’s Finest in the catalog from the reader’s own words', () => {
    expect(findWorkByTitle("World's Finest", CATALOG_WORKS)?.id).toBe('arc-worlds-finest-vol-1');
  });
});

describe('resolveProposals', () => {
  const none = () => 'none' as const;
  it('turns "I finished X" into a question, never an action', () => {
    const p = resolveProposals([{ work: "World's Finest Vol 1", action: 'mark_finished' }], titles, none);
    expect(p).toHaveLength(1);
    expect(p[0].prompt).toBe('Sounds like you finished Batman/Superman: World’s Finest Vol. 1. Mark as finished?');
    expect(p[0]).not.toHaveProperty('applied');
  });
  it('drops proposals that are already true', () => {
    expect(resolveProposals([{ work: "World's Finest", action: 'mark_finished' }], titles, () => 'done')).toEqual([]);
    expect(resolveProposals([{ work: "World's Finest", action: 'mark_reading' }], titles, () => 'reading')).toEqual([]);
  });
  it('does not propose "reading" for a book already finished', () => {
    expect(resolveProposals([{ work: "World's Finest", action: 'mark_reading' }], titles, () => 'done')).toEqual([]);
  });
  it('drops books it cannot match and collapses duplicates', () => {
    const p = resolveProposals([
      { work: 'Nonexistent Book', action: 'mark_finished' },
      { work: "World's Finest", action: 'mark_reading' },
      { work: "World's Finest Vol 1", action: 'mark_reading' },
    ], titles, none);
    expect(p.map((x) => x.workId)).toEqual(['wf1']);
  });
  it('end to end: the spec message proposes marking World’s Finest as reading', () => {
    const intent = interpretOffline("I am reading World's Finest. It's going good.");
    const p = resolveProposals(intent.proposedLibraryUpdates, CATALOG_WORKS, none);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ workId: 'arc-worlds-finest-vol-1', action: 'mark_reading' });
  });
  it('end to end: "I finished World’s Finest Vol 1. Loved the art…" proposes marking it finished', () => {
    const intent = interpretOffline("I finished World's Finest Vol 1. Loved the art but didn't care about the villain.");
    const p = resolveProposals(intent.proposedLibraryUpdates, CATALOG_WORKS, none);
    expect(p[0]).toMatchObject({ workId: 'arc-worlds-finest-vol-1', action: 'mark_finished' });
  });
});
