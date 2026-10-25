// Who appears in a book, and the one-line explanations shown in "Meet the
// characters". Hand-maintained and deliberately small: an entry is added only
// where the fact is one we would stand behind, and explanations say who a
// character IS, never what happens to them (spoiler-safe by construction).
//
// Relations follow the rule in engines/arc/characters.ts: appearing in a book
// is never a prerequisite. Everything here is optional background unless
// stated otherwise, so a reader can always keep reading.
import type { CastEntry, GlossaryEntry } from '../engines/arc/characters';

export const WORLDS_FINEST_ID = 'arc-worlds-finest-vol-1';

export const WORK_CAST: Record<string, CastEntry[]> = {
  [WORLDS_FINEST_ID]: [
    { character: 'Batman', relation: 'optional_context' },
    { character: 'Superman', relation: 'optional_context' },
    { character: 'Robin', relation: 'optional_context' },
    { character: 'Doom Patrol', relation: 'optional_context' },
    { character: 'Metamorpho', relation: 'optional_context' },
    { character: 'Nezha', relation: 'optional_context' },
  ],
};

export const CHARACTER_GLOSSARY: GlossaryEntry[] = [
  {
    name: 'Doom Patrol',
    whoAreThey: 'A team of unusual heroes whose powers often came with personal consequences.',
    whyHere: { [WORLDS_FINEST_ID]: 'They appear as an established superhero team. You only need to know that.' },
  },
  {
    name: 'Metamorpho',
    whoAreThey: 'A hero who can reshape his body into different elements.',
    whyHere: { [WORLDS_FINEST_ID]: 'An established DC hero. No background needed to follow this book.' },
  },
  {
    name: 'Robin',
    whoAreThey: 'Batman’s young partner. Several people have worn the name over the years.',
  },
];
