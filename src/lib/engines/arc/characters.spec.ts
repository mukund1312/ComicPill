import { describe, expect, it } from 'vitest';
import {
  canContinueReading, contextNeededFor, familiarityOf, meetTheCharacters, newCharacters,
  type CastEntry, type GlossaryEntry, type ReaderWork,
} from './characters';
import { CHARACTER_GLOSSARY, WORK_CAST, WORLDS_FINEST_ID } from '../../data/castData';
import { CATALOG_WORKS } from '../../db/seed/catalog';

const reader: ReaderWork[] = [
  { characters: ['Batman'], status: 'done', accessible: true },       // Year One
  { characters: ['Batman', 'Robin'], status: 'none', accessible: true }, // Dark Victory: owned, unread
  { characters: ['Superman'], status: 'done', accessible: true },
];

describe('familiarity', () => {
  it('known = finished something with them', () => expect(familiarityOf('Batman', reader)).toBe('known'));
  it('some context = owns/reads something with them but has not finished it', () => expect(familiarityOf('Robin', reader)).toBe('some_context'));
  it('new = nothing on the shelf features them', () => expect(familiarityOf('Doom Patrol', reader)).toBe('new'));
  it('ignores case and punctuation', () => expect(familiarityOf('batman', reader)).toBe('known'));
});

describe('unfamiliar is never a prerequisite', () => {
  const cast: CastEntry[] = [
    { character: 'Doom Patrol', relation: 'optional_context' },
    { character: 'Nezha', relation: 'introduction' },
    { character: 'Metamorpho', relation: 'cameo' },
  ];
  const meet = meetTheCharacters('w', cast, [], reader);

  it('all-new, no-requirement cast never blocks reading', () => {
    expect(newCharacters(meet)).toHaveLength(3);
    expect(canContinueReading(meet)).toBe(true);
    expect(meet.every((m) => m.contextNeeded === 'none')).toBe(true);
  });

  it('only an explicit required_before relation to something unmet blocks', () => {
    const gated = meetTheCharacters('w', [{ character: 'Doom Patrol', relation: 'required_before' }], [], reader);
    expect(canContinueReading(gated)).toBe(false);
    const met = meetTheCharacters('w', [{ character: 'Batman', relation: 'required_before' }], [], reader);
    expect(canContinueReading(met)).toBe(true); // already known
  });

  it('maps every relation to a context level', () => {
    expect(contextNeededFor('cameo')).toBe('none');
    expect(contextNeededFor('introduction')).toBe('none');
    expect(contextNeededFor('optional_context')).toBe('none');
    expect(contextNeededFor('helpful_context')).toBe('helpful');
    expect(contextNeededFor('recommended_before')).toBe('helpful');
    expect(contextNeededFor('required_before')).toBe('required');
  });
});

describe('glossary', () => {
  const glossary: GlossaryEntry[] = [{ name: 'Doom Patrol', whoAreThey: 'A team.', whyHere: { w: 'Here.' } }];
  it('attaches "just enough" text, and book-specific text only for that book', () => {
    const a = meetTheCharacters('w', [{ character: 'doom patrol', relation: 'cameo' }], glossary, [])[0];
    expect(a.whoAreThey).toBe('A team.');
    expect(a.whyHere).toBe('Here.');
    const b = meetTheCharacters('other', [{ character: 'Doom Patrol', relation: 'cameo' }], glossary, [])[0];
    expect(b.whyHere).toBeNull();
  });
  it('leaves text null (never invents it) for a character with no entry', () => {
    const m = meetTheCharacters('w', [{ character: 'Nobody Known', relation: 'cameo' }], glossary, [])[0];
    expect(m.whoAreThey).toBeNull();
    expect(m.whyHere).toBeNull();
  });
});

describe("World's Finest seed data (the spec's scenario)", () => {
  const meet = meetTheCharacters(WORLDS_FINEST_ID, WORK_CAST[WORLDS_FINEST_ID], CHARACTER_GLOSSARY, reader);
  const get = (n: string) => meet.find((m) => m.name === n)!;

  it('the book exists in the catalog', () => {
    expect(CATALOG_WORKS.some((w) => w.id === WORLDS_FINEST_ID)).toBe(true);
  });
  it('Batman is known, Robin has some context, Doom Patrol is new — and none of it blocks reading', () => {
    expect(get('Batman').familiarity).toBe('known');
    expect(get('Robin').familiarity).toBe('some_context');
    expect(get('Doom Patrol').familiarity).toBe('new');
    expect(canContinueReading(meet)).toBe(true);
    expect(get('Doom Patrol').contextNeeded).toBe('none');
  });
  it('Doom Patrol’s explanation says you only need to know they are an established team', () => {
    expect(get('Doom Patrol').whoAreThey).toMatch(/unusual heroes/);
    expect(get('Doom Patrol').whyHere).toMatch(/established superhero team/);
  });
  it('no seeded relation makes a character a hard prerequisite', () => {
    for (const cast of Object.values(WORK_CAST)) expect(cast.some((c) => c.relation === 'required_before')).toBe(false);
  });
});
