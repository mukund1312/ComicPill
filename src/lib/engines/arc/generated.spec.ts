import { describe, expect, it } from 'vitest';
import { aliasesFor, buildCharacterTemplates, type PlainWork } from './generated';

const w = (id: string, title: string, characters: string[], keeper = false): PlainWork => ({ id, title, characters, keeper });

describe('generated character journeys', () => {
  const works = [
    w('s1', 'Spider-Man: Brand New Day', ['Spider-Man']), w('s2', 'Spider-Man: Family Business', ['Spider-Man']),
    w('s3', 'Superior Spider-Man Vol. 1', ['Spider-Man', 'Doctor Octopus']), w('s4', 'Marvel 1602', ['Spider-Man', 'Doctor Strange']),
    w('x1', 'X-Men One', ['X-Men']), w('x2', 'X-Men Two', ['X-Men']),
  ];
  const built = buildCharacterTemplates(works);

  it('makes a journey for a character with enough books and none for one with too few', () => {
    expect(built.map((t) => t.character)).toEqual(['Spider-Man']);
  });
  it('puts solo books first and later books where the villains show up', () => {
    const t = built[0];
    expect(t.chapters[0].milestones[0].items.map((i) => i.workId)).toEqual(['s1', 's2']);
    expect(t.chapters[1].milestones[0].items.map((i) => i.why).join(' ')).toContain('Doctor Octopus');
  });
  it('is found by the way people type the name', () => {
    expect(aliasesFor('Spider-Man').map((a) => a.toLowerCase())).toEqual(expect.arrayContaining(['spiderman', 'spider man', 'spidey']));
  });
  it('leaves the hand-written journeys alone', () => {
    expect(buildCharacterTemplates(works, ['Spider-Man'])).toHaveLength(0);
  });
});

import { interpretOffline } from '../../intent/offline';
import { resolveArc } from '../../intent/resolve';

describe('asking for a generated journey in plain words', () => {
  const works = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, title: `Spider-Man ${i}`, characters: i > 1 ? ['Spider-Man', 'Doctor Octopus'] : ['Spider-Man'], keeper: false }));
  const templates = buildCharacterTemplates(works);
  it('matches "spiderman fighting all his villains" to the Spider-Man journey', () => {
    const intent = interpretOffline('I want spiderman fighting all his villains', templates);
    const resolved = resolveArc(intent, templates);
    expect(resolved.kind).toBe('match');
    if (resolved.kind === 'match') expect(resolved.templateKey).toBe('auto-spider-man');
  });
});
