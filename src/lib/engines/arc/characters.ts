// "Meet the characters": for a book the reader is on, who is in it, whether
// they already know them, and — crucially — whether not knowing them matters.
//
// The rule this file exists to enforce: UNFAMILIARITY IS NOT A PREREQUISITE.
// A character being new to the reader says nothing about whether they need
// to read anything first. That comes only from an explicit relation on the
// book's cast list ('required_before' and friends); a cameo, an introduction
// or optional background never blocks reading.
export type CharacterRelation =
  | 'cameo' | 'introduction' | 'optional_context' | 'helpful_context' | 'recommended_before' | 'required_before';

export type ContextNeeded = 'none' | 'helpful' | 'required';
export type Familiarity = 'known' | 'some_context' | 'new';

export interface CastEntry { character: string; relation: CharacterRelation }

export interface GlossaryEntry {
  name: string;
  /** "Just enough": who are they, in a sentence. Spoiler-safe. */
  whoAreThey: string;
  /** Why they're in a specific book (keyed by workId). */
  whyHere?: Record<string, string>;
}

/** What the reader has, for the purpose of judging familiarity. */
export interface ReaderWork { characters: string[]; status: 'none' | 'reading' | 'done' | 'dropped'; accessible: boolean }

export interface MeetCharacter {
  name: string;
  familiarity: Familiarity;
  relation: CharacterRelation;
  contextNeeded: ContextNeeded;
  whoAreThey: string | null;
  whyHere: string | null;
}

export function contextNeededFor(relation: CharacterRelation): ContextNeeded {
  switch (relation) {
    case 'required_before': return 'required';
    case 'recommended_before':
    case 'helpful_context': return 'helpful';
    case 'cameo':
    case 'introduction':
    case 'optional_context': return 'none';
  }
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Known = they've finished something featuring the character.
 *  Some context = they have (or are reading) something featuring them.
 *  New = neither. */
export function familiarityOf(name: string, reader: ReaderWork[], excludeWork?: ReaderWork): Familiarity {
  const k = key(name);
  const features = (w: ReaderWork) => w.characters.some((c) => key(c) === k);
  const others = reader.filter((w) => w !== excludeWork && features(w));
  if (others.some((w) => w.status === 'done')) return 'known';
  if (others.some((w) => w.status === 'reading' || w.accessible)) return 'some_context';
  return 'new';
}

export function meetTheCharacters(
  workId: string,
  cast: CastEntry[],
  glossary: GlossaryEntry[],
  reader: ReaderWork[],
): MeetCharacter[] {
  const byName = new Map(glossary.map((g) => [key(g.name), g]));
  return cast.map((entry) => {
    const g = byName.get(key(entry.character));
    return {
      name: entry.character,
      familiarity: familiarityOf(entry.character, reader),
      relation: entry.relation,
      contextNeeded: contextNeededFor(entry.relation),
      whoAreThey: g?.whoAreThey ?? null,
      whyHere: g?.whyHere?.[workId] ?? null,
    };
  });
}

/** Can the reader keep going? Only an explicit REQUIRED relation to something
 *  they haven't met stops them — never mere unfamiliarity. */
export function canContinueReading(meet: MeetCharacter[]): boolean {
  return !meet.some((m) => m.contextNeeded === 'required' && m.familiarity === 'new');
}

/** New characters worth a mention, most useful first. */
export function newCharacters(meet: MeetCharacter[]): MeetCharacter[] {
  return meet.filter((m) => m.familiarity === 'new');
}
