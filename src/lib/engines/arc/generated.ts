// Journeys made from the catalog itself. The hand-written templates (Batman family, Nightwing, Superman) are rich but few;
// this builds a simple, honest "start here → the main run → going deeper" journey for every other character with enough books,
// so a request like "Spider-Man fighting his villains" lands on something real. Pure: it takes plain works, so it is easy to test.
import type { ArcItemDef, ArcMilestoneDef, ArcTemplate } from './types';

export interface PlainWork { id: string; title: string; characters: string[]; keeper: boolean }

const MIN_BOOKS = 3;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** Spellings people actually type for a name: "Spider-Man" → "Spiderman", "Spider Man", "Spidey". */
export function aliasesFor(name: string): string[] {
  const set = new Set<string>();
  const plain = name.replace(/^the\s+/i, '');
  set.add(plain);
  set.add(plain.replace(/-/g, '')); // "SpiderMan" — matching ignores case
  set.add(plain.replace(/-/g, ' '));
  if (/spider-?man/i.test(name)) { set.add('Spidey'); set.add('Peter Parker'); }
  if (/^the flash$/i.test(name)) set.add('Flash');
  if (/^iron man$/i.test(name)) set.add('Tony Stark');
  if (/^wolverine$/i.test(name)) set.add('Logan');
  if (/^daredevil$/i.test(name)) set.add('Matt Murdock');
  set.delete(name);
  return [...set].filter((a) => a.length > 2);
}

export function buildCharacterTemplates(works: PlainWork[], skipCharacters: string[] = []): ArcTemplate[] {
  const skip = new Set(skipCharacters.map((c) => c.toLowerCase()));
  const by = new Map<string, PlainWork[]>();
  for (const w of works) for (const c of w.characters) { const list = by.get(c) ?? []; list.push(w); by.set(c, list); }

  const out: ArcTemplate[] = [];
  for (const [character, list] of by) {
    if (list.length < MIN_BOOKS || skip.has(character.toLowerCase())) continue;
    // Solo books first (the "start here" picks), then the ones with other characters in them — where the villains and allies show up.
    const sorted = [...list].sort((a, b) => Number(b.keeper) - Number(a.keeper) || a.characters.length - b.characters.length || natural(a.title, b.title));
    const mk = (w: PlainWork, tier: ArcItemDef['tier'], why: string): ArcItemDef => ({ workId: w.id, tier, continuity: 'main', why });
    const others = (w: PlainWork) => w.characters.filter((c) => c !== character)[0];

    const start = sorted.slice(0, 2).map((w) => mk(w, 'essential', `A good first step into ${character}’s world.`));
    const run = sorted.slice(2, 6).map((w) => mk(w, 'recommended', others(w) ? `${character} meets ${others(w)}.` : `More of ${character}’s story.`));
    const deeper = sorted.slice(6, 14).map((w) => mk(w, 'optional', `For when you want even more ${character}.`));

    const milestones = (id: string, title: string, change: string, items: ArcItemDef[]): ArcMilestoneDef[] => (items.length ? [{ id, title, change, character, items }] : []);
    const chapters = [
      { id: 'g-start', title: 'Start here', tagline: `The best way in to ${character}.`, milestones: milestones('g-ms-start', `Meet ${character}`, `You get to know ${character}.`, start) },
      { id: 'g-run', title: 'The main run', tagline: `${character}, up against the world.`, milestones: milestones('g-ms-run', `${character} faces his world`, `The stories that define ${character}.`, run) },
      { id: 'g-deeper', title: 'Going deeper', tagline: 'Optional extras.', milestones: milestones('g-ms-deeper', 'Beyond the essentials', `More ${character} when you want it.`, deeper) },
    ].filter((c) => c.milestones.length);

    out.push({
      key: `auto-${slug(character)}`,
      title: `${character}: where to start`,
      goal: `Read ${character} from the best starting point, through the stories that matter most.`,
      kinds: ['character_life_arc'],
      character,
      aliases: aliasesFor(character),
      chapters,
    });
  }
  return out;
}
