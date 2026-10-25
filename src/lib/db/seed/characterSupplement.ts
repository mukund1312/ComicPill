// Characters the catalog's own metadata omits but that are unambiguously in
// these books. Onboarding lets a reader say "I like Lex Luthor"; that only
// changes what they're recommended if works actually carry the name. Kept
// deliberately short and certain — every entry is a book where the character
// is central or in the title.
export const CHARACTER_SUPPLEMENT: Record<string, string[]> = {
  'birthright': ['Lex Luthor', 'Lois Lane'],
  'all-star': ['Lex Luthor', 'Lois Lane'],
  'red-son': ['Lex Luthor', 'Lois Lane'],
  'dc-800-superman-secret-origin': ['Lex Luthor', 'Lois Lane'],
  'dc-800-superman-lois-and-clark': ['Lois Lane'],
  'dc-800-batman-knightfall-vol-1': ['Bane'],
  'dc-800-batman-city-of-bane': ['Bane'],
  'dc-800-batman-i-am-bane': ['Bane'],
  'dd-born-again': ['Kingpin'],
  'gl-sinestro-corps': ['Sinestro'],
  'hush': ['Riddler'],
  'dc-800-batman-zero-year': ['Riddler'],
  'dc-800-batman-the-war-of-jokes-and-riddles': ['Riddler'],
};

/** Existing characters plus the supplement for that work, without duplicates. */
export function withSupplement(workId: string, characters: string[]): string[] {
  const extra = CHARACTER_SUPPLEMENT[workId] ?? [];
  return extra.length ? [...new Set([...characters, ...extra])] : characters;
}
