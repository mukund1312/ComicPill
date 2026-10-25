// The curated vocabulary of taste onboarding: who a reader can say they like,
// how those characters relate, and the visual/story options offered.
//
// Rules that keep this honest (all enforced in entities.spec.ts):
//  - every entity's image is a REAL bundled cover of a book that features
//    them — nothing scraped, nothing invented;
//  - every character/creator name matches the catalog's own metadata, so
//    a stated "like" can actually change which books are recommended;
//  - relationships are established comics facts (family, team, rivalry,
//    nemesis), typed, and reference only known characters;
//  - nothing is offered whose taste signal the app could not act on.

import type { Dim } from '../types/domain';

export type Alignment = 'hero' | 'villain' | 'antihero' | 'neutral' | 'variable';
export type Publisher = 'DC' | 'Marvel' | 'Indie';

export interface CharacterEntity {
  kind: 'character';
  id: string;
  name: string;
  /** How the catalog spells this character in work metadata (may be several). */
  catalogNames: string[];
  alignment: Alignment;
  publisher: Publisher;
  /** A book that features them, whose cover is used as their picture. */
  signatureWorkId: string;
  /** 0..1, used only to order the opening screen and fill diversity slots. */
  popularity: number;
  aliases?: string[];
}

export type RelationType =
  | 'FAMILY' | 'TEAM' | 'ALLY' | 'RIVAL' | 'ENEMY' | 'MENTOR' | 'SIDEKICK' | 'SUCCESSOR'
  | 'ROMANTIC' | 'SHARED_SERIES' | 'SIMILAR_READER_INTEREST';

export interface Relationship { from: string; to: string; type: RelationType; strength: number }

const c = (
  slug: string, name: string, alignment: Alignment, publisher: Publisher, signatureWorkId: string, popularity: number,
  extra: { catalogNames?: string[]; aliases?: string[] } = {},
): CharacterEntity => ({
  kind: 'character', id: `char:${slug}`, name, catalogNames: extra.catalogNames ?? [name], alignment, publisher, signatureWorkId, popularity, aliases: extra.aliases,
});

export const CHARACTERS: CharacterEntity[] = [
  // ---- DC ----
  c('batman', 'Batman', 'hero', 'DC', 'year-one', 1.0, { aliases: ['Bruce Wayne', 'Dark Knight'] }),
  c('superman', 'Superman', 'hero', 'DC', 'birthright', 0.96, { aliases: ['Clark Kent', 'Kal-El'] }),
  c('wonder-woman', 'Wonder Woman', 'hero', 'DC', 'abs-wonder-woman', 0.86, { aliases: ['Diana'] }),
  c('flash', 'The Flash', 'hero', 'DC', 'flash-rebirth', 0.78, { catalogNames: ['The Flash', 'Flash'], aliases: ['Barry Allen'] }),
  c('green-lantern', 'Green Lantern', 'hero', 'DC', 'gl-rebirth', 0.72),
  c('aquaman', 'Aquaman', 'hero', 'DC', 'aquaman-trench', 0.6),
  c('nightwing', 'Nightwing', 'hero', 'DC', 'nightwing-year-one', 0.8, { aliases: ['Dick Grayson'] }),
  c('robin', 'Robin', 'hero', 'DC', 'robin-year-one', 0.62),
  c('red-hood', 'Red Hood', 'antihero', 'DC', 'under-red-hood', 0.7, { aliases: ['Jason Todd'] }),
  c('batgirl', 'Batgirl', 'hero', 'DC', 'batgirl-year-one', 0.6, { aliases: ['Barbara Gordon'] }),
  c('catwoman', 'Catwoman', 'antihero', 'DC', 'catwoman-lonely-city', 0.7, { aliases: ['Selina Kyle'] }),
  c('supergirl', 'Supergirl', 'hero', 'DC', 'supergirl-woman-tomorrow', 0.55, { aliases: ['Kara Zor-El'] }),
  c('lois-lane', 'Lois Lane', 'hero', 'DC', 'birthright', 0.5),
  c('swamp-thing', 'Swamp Thing', 'hero', 'DC', 'swamp-thing', 0.4),
  c('sandman', 'Sandman', 'neutral', 'DC', 'sandman-preludes', 0.62, { catalogNames: ['Dream', 'The Sandman'], aliases: ['Morpheus', 'Dream'] }),
  // ---- Marvel ----
  c('spider-man', 'Spider-Man', 'hero', 'Marvel', 'asm-coming-home', 0.99, { aliases: ['Peter Parker'] }),
  c('daredevil', 'Daredevil', 'hero', 'Marvel', 'dd-born-again', 0.82, { aliases: ['Matt Murdock'] }),
  c('thor', 'Thor', 'hero', 'Marvel', 'thor-god-butcher', 0.84),
  c('wolverine', 'Wolverine', 'antihero', 'Marvel', 'old-man-logan', 0.9, { aliases: ['Logan'] }),
  c('hulk', 'Hulk', 'hero', 'Marvel', 'immortal-hulk-vol1', 0.8),
  c('iron-man', 'Iron Man', 'hero', 'Marvel', 'civil-war', 0.88, { aliases: ['Tony Stark'] }),
  c('captain-america', 'Captain America', 'hero', 'Marvel', 'cap-winter-soldier', 0.82, { aliases: ['Steve Rogers'] }),
  c('black-panther', 'Black Panther', 'hero', 'Marvel', 'bp-nation', 0.7),
  c('doctor-strange', 'Doctor Strange', 'hero', 'Marvel', 'doctor-strange-oath', 0.68),
  c('punisher', 'Punisher', 'antihero', 'Marvel', 'punisher-max-vol1', 0.7, { aliases: ['Frank Castle'] }),
  c('elektra', 'Elektra', 'antihero', 'Marvel', 'elektra-assassin', 0.45),
  c('moon-knight', 'Moon Knight', 'antihero', 'Marvel', 'moon-knight-from-dead', 0.6),
  c('black-widow', 'Black Widow', 'hero', 'Marvel', 'black-widow-finely-woven-thread', 0.6),
  c('ms-marvel', 'Ms. Marvel', 'hero', 'Marvel', 'ms-marvel-no-normal', 0.58, { aliases: ['Kamala Khan'] }),
  c('silver-surfer', 'Silver Surfer', 'hero', 'Marvel', 'silver-surfer-parable', 0.5),
  c('x-men', 'X-Men', 'hero', 'Marvel', 'xmen-dark-phoenix', 0.85, { aliases: ['Mutants'] }),
  // ---- Independent ----
  c('hellboy', 'Hellboy', 'antihero', 'Indie', 'hellboy-wake-devil', 0.55),
  c('spawn', 'Spawn', 'antihero', 'Indie', 'spawn-origins-one', 0.5),
  // ---- Villains & troublemakers ----
  c('joker', 'Joker', 'villain', 'DC', 'killing-joke', 0.97),
  c('two-face', 'Two-Face', 'villain', 'DC', 'dark-victory', 0.6),
  c('harley-quinn', 'Harley Quinn', 'variable', 'DC', 'batman-mad-love', 0.8),
  c('bane', 'Bane', 'villain', 'DC', 'dc-800-batman-knightfall-vol-1', 0.66),
  c('riddler', 'Riddler', 'villain', 'DC', 'hush', 0.55),
  c('lex-luthor', 'Lex Luthor', 'villain', 'DC', 'red-son', 0.78),
  c('darkseid', 'Darkseid', 'villain', 'DC', 'darkseid-war', 0.7),
  c('sinestro', 'Sinestro', 'villain', 'DC', 'gl-sinestro-corps', 0.5),
  c('thanos', 'Thanos', 'villain', 'Marvel', 'infinity-gauntlet', 0.86),
  c('loki', 'Loki', 'variable', 'Marvel', 'loki-agent-asgard-one', 0.82),
  c('kingpin', 'Kingpin', 'villain', 'Marvel', 'dd-born-again', 0.62),
  c('venom', 'Venom', 'variable', 'Marvel', 'venom-rex', 0.8),
  c('doctor-octopus', 'Doctor Octopus', 'villain', 'Marvel', 'superior-spider-man-one', 0.6),
  c('magneto', 'Magneto', 'variable', 'Marvel', 'magneto-testament', 0.78),
  c('galactus', 'Galactus', 'villain', 'Marvel', 'silver-surfer-parable', 0.5),
];

// [from, to, type, strength]. Read in both directions by the discovery engine.
const REL: [string, string, RelationType, number][] = [
  // The Batman family & rogues
  ['batman', 'nightwing', 'SIDEKICK', 0.9], ['batman', 'robin', 'SIDEKICK', 0.9], ['batman', 'red-hood', 'SIDEKICK', 0.85],
  ['batman', 'batgirl', 'ALLY', 0.8], ['batman', 'catwoman', 'ROMANTIC', 0.8], ['batman', 'joker', 'ENEMY', 0.95],
  ['batman', 'two-face', 'ENEMY', 0.8], ['batman', 'harley-quinn', 'ENEMY', 0.6], ['batman', 'riddler', 'ENEMY', 0.7], ['batman', 'bane', 'ENEMY', 0.75],
  ['batman', 'superman', 'TEAM', 0.7], ['batman', 'wonder-woman', 'TEAM', 0.6],
  ['batman', 'daredevil', 'SIMILAR_READER_INTEREST', 0.5], ['batman', 'moon-knight', 'SIMILAR_READER_INTEREST', 0.55],
  ['nightwing', 'robin', 'FAMILY', 0.8], ['nightwing', 'red-hood', 'FAMILY', 0.7], ['nightwing', 'batgirl', 'ALLY', 0.7],
  ['red-hood', 'joker', 'ENEMY', 0.6], ['red-hood', 'punisher', 'SIMILAR_READER_INTEREST', 0.4],
  ['catwoman', 'harley-quinn', 'ALLY', 0.5], ['harley-quinn', 'joker', 'ROMANTIC', 0.9],
  // Superman & the League
  ['superman', 'lois-lane', 'ROMANTIC', 0.9], ['superman', 'supergirl', 'FAMILY', 0.85], ['superman', 'lex-luthor', 'ENEMY', 0.95],
  ['superman', 'wonder-woman', 'TEAM', 0.7], ['superman', 'darkseid', 'ENEMY', 0.5],
  ['wonder-woman', 'aquaman', 'TEAM', 0.6], ['wonder-woman', 'flash', 'TEAM', 0.5], ['wonder-woman', 'green-lantern', 'TEAM', 0.5], ['wonder-woman', 'darkseid', 'ENEMY', 0.4],
  ['flash', 'green-lantern', 'ALLY', 0.7], ['green-lantern', 'sinestro', 'ENEMY', 0.95], ['aquaman', 'flash', 'TEAM', 0.4], ['darkseid', 'sinestro', 'SHARED_SERIES', 0.3],
  // Spider-Man & the street
  ['spider-man', 'venom', 'ENEMY', 0.9], ['spider-man', 'doctor-octopus', 'ENEMY', 0.9], ['spider-man', 'kingpin', 'ENEMY', 0.6],
  ['spider-man', 'daredevil', 'ALLY', 0.6], ['spider-man', 'ms-marvel', 'SIMILAR_READER_INTEREST', 0.5], ['spider-man', 'iron-man', 'ALLY', 0.5],
  ['daredevil', 'kingpin', 'ENEMY', 0.95], ['daredevil', 'elektra', 'ROMANTIC', 0.85], ['daredevil', 'punisher', 'RIVAL', 0.7],
  ['daredevil', 'moon-knight', 'SIMILAR_READER_INTEREST', 0.6], ['daredevil', 'black-widow', 'ALLY', 0.5],
  ['punisher', 'kingpin', 'ENEMY', 0.5], ['punisher', 'moon-knight', 'SIMILAR_READER_INTEREST', 0.5],
  // Avengers & cosmic
  ['thor', 'loki', 'FAMILY', 0.95], ['thor', 'hulk', 'TEAM', 0.6], ['thor', 'captain-america', 'TEAM', 0.7], ['thor', 'iron-man', 'TEAM', 0.7], ['thor', 'thanos', 'ENEMY', 0.4],
  ['iron-man', 'captain-america', 'TEAM', 0.8], ['iron-man', 'thanos', 'ENEMY', 0.4], ['iron-man', 'doctor-strange', 'TEAM', 0.5], ['iron-man', 'black-panther', 'TEAM', 0.5],
  ['captain-america', 'black-widow', 'ALLY', 0.7], ['black-panther', 'captain-america', 'TEAM', 0.5],
  ['hulk', 'thanos', 'ENEMY', 0.4], ['hulk', 'silver-surfer', 'ALLY', 0.4],
  ['thanos', 'silver-surfer', 'SHARED_SERIES', 0.5], ['thanos', 'galactus', 'SHARED_SERIES', 0.4], ['galactus', 'silver-surfer', 'MENTOR', 0.95],
  ['doctor-strange', 'moon-knight', 'SIMILAR_READER_INTEREST', 0.4],
  // The X-Men
  ['wolverine', 'x-men', 'TEAM', 0.9], ['x-men', 'magneto', 'ENEMY', 0.8], ['wolverine', 'magneto', 'ENEMY', 0.7],
  // Dark & supernatural
  ['hellboy', 'swamp-thing', 'SIMILAR_READER_INTEREST', 0.5], ['sandman', 'swamp-thing', 'SIMILAR_READER_INTEREST', 0.6],
  ['hellboy', 'spawn', 'SIMILAR_READER_INTEREST', 0.4], ['sandman', 'hellboy', 'SIMILAR_READER_INTEREST', 0.4],
];

export const RELATIONSHIPS: Relationship[] = REL.map(([a, b, type, strength]) => ({ from: `char:${a}`, to: `char:${b}`, type, strength }));

// ---- creators ---------------------------------------------------------------

export type CreatorRole = 'artist' | 'writer';

export interface CreatorEntity {
  kind: 'creator';
  id: string;
  name: string;
  roles: CreatorRole[];
  /** A book they are credited on, whose cover stands in for a portrait. */
  signatureWorkId: string;
  popularity: number;
}

const p = (slug: string, name: string, roles: CreatorRole[], signatureWorkId: string, popularity: number): CreatorEntity =>
  ({ kind: 'creator', id: `creator:${slug}`, name, roles, signatureWorkId, popularity });

export const CREATORS: CreatorEntity[] = [
  // artists
  p('jim-lee', 'Jim Lee', ['artist'], 'hush', 0.95), p('alex-ross', 'Alex Ross', ['artist'], 'kingdom-come', 0.92),
  p('greg-capullo', 'Greg Capullo', ['artist'], 'death-of-family', 0.8), p('dan-mora', 'Dan Mora', ['artist'], 'once-future-king-undead', 0.6),
  p('david-mazzucchelli', 'David Mazzucchelli', ['artist'], 'year-one', 0.75), p('tim-sale', 'Tim Sale', ['artist'], 'long-halloween', 0.85),
  p('frank-quitely', 'Frank Quitely', ['artist'], 'all-star', 0.78), p('bill-sienkiewicz', 'Bill Sienkiewicz', ['artist'], 'daredevil-love-and-war', 0.55),
  p('fiona-staples', 'Fiona Staples', ['artist'], 'saga-vol1', 0.8), p('darwyn-cooke', 'Darwyn Cooke', ['artist'], 'new-frontier', 0.7),
  p('sean-murphy', 'Sean Murphy', ['artist', 'writer'], 'white-knight', 0.72), p('mike-mignola', 'Mike Mignola', ['artist', 'writer'], 'hellboy-wake-devil', 0.72),
  p('dave-mckean', 'Dave McKean', ['artist'], 'batman-arkham-asylum', 0.6), p('esad-ribic', 'Esad Ribic', ['artist'], 'thor-god-butcher', 0.55),
  p('george-perez', 'George Pérez', ['artist'], 'coie', 0.8), p('jock', 'Jock', ['artist'], 'black-mirror', 0.6),
  p('david-aja', 'David Aja', ['artist'], 'hawkeye-fraction-vol1', 0.6), p('nick-dragotta', 'Nick Dragotta', ['artist'], 'abs-batman-1', 0.55),
  p('marcos-martin', 'Marcos Martin', ['artist'], 'doctor-strange-oath', 0.55), p('mitch-gerads', 'Mitch Gerads', ['artist'], 'mister-miracle-king', 0.55),
  p('john-romita-jr', 'John Romita Jr.', ['artist'], 'asm-coming-home', 0.65), p('jae-lee', 'Jae Lee', ['artist'], 'inhumans-jenkins-lee', 0.45),
  p('jack-kirby', 'Jack Kirby', ['artist'], 'new-gods-kirby', 0.85),
  // writers
  p('alan-moore', 'Alan Moore', ['writer'], 'watchmen', 1.0), p('frank-miller', 'Frank Miller', ['writer', 'artist'], 'dark-knight-returns', 0.95),
  p('grant-morrison', 'Grant Morrison', ['writer'], 'all-star', 0.9), p('scott-snyder', 'Scott Snyder', ['writer'], 'batman-court-of-owls', 0.82),
  p('tom-king', 'Tom King', ['writer'], 'vision-tom-king', 0.78), p('mark-waid', 'Mark Waid', ['writer'], 'kingdom-come', 0.78),
  p('jonathan-hickman', 'Jonathan Hickman', ['writer'], 'avengers-hickman', 0.8), p('chip-zdarsky', 'Chip Zdarsky', ['writer'], 'dd-zdarsky', 0.7),
  p('ed-brubaker', 'Ed Brubaker', ['writer'], 'cap-winter-soldier', 0.82), p('brian-k-vaughan', 'Brian K. Vaughan', ['writer'], 'saga-vol1', 0.9),
  p('jeph-loeb', 'Jeph Loeb', ['writer'], 'dark-victory', 0.78), p('gail-simone', 'Gail Simone', ['writer'], 'birds-prey-murder-mystery', 0.6),
  p('neil-gaiman', 'Neil Gaiman', ['writer'], 'sandman-preludes', 0.92), p('geoff-johns', 'Geoff Johns', ['writer'], 'gl-rebirth', 0.85),
  p('greg-rucka', 'Greg Rucka', ['writer'], 'ww-hiketeia', 0.65), p('warren-ellis', 'Warren Ellis', ['writer'], 'transmet-back-street', 0.7),
  p('jason-aaron', 'Jason Aaron', ['writer'], 'thor-god-butcher', 0.72), p('kelly-sue-deconnick', 'Kelly Sue DeConnick', ['writer'], 'wonder-woman-historia', 0.5),
  p('g-willow-wilson', 'G. Willow Wilson', ['writer'], 'ms-marvel-no-normal', 0.5), p('al-ewing', 'Al Ewing', ['writer'], 'immortal-hulk-vol1', 0.55),
  p('garth-ennis', 'Garth Ennis', ['writer'], 'preacher-1', 0.72), p('jeff-lemire', 'Jeff Lemire', ['writer'], 'black-hammer-secret', 0.6),
  p('brian-michael-bendis', 'Brian Michael Bendis', ['writer'], 'dd-bendis', 0.78), p('james-tynion-iv', 'James Tynion IV', ['writer'], 'siktc', 0.6),
  p('mark-millar', 'Mark Millar', ['writer'], 'civil-war', 0.8), p('chris-claremont', 'Chris Claremont', ['writer'], 'xmen-dark-phoenix', 0.78),
  p('kurt-busiek', 'Kurt Busiek', ['writer'], 'marvels', 0.6), p('matt-fraction', 'Matt Fraction', ['writer'], 'hawkeye-fraction-vol1', 0.6),
];

// ---- art styles, genres, traits ---------------------------------------------


export type DimSeeds = Partial<Record<Dim, number>>;

export interface ArtStyle { kind: 'art_style'; id: string; label: string; blurb: string; exemplarWorkId: string; seeds: DimSeeds }

const s = (slug: string, label: string, blurb: string, exemplarWorkId: string, seeds: DimSeeds): ArtStyle =>
  ({ kind: 'art_style', id: `style:${slug}`, label, blurb, exemplarWorkId, seeds });

export const ART_STYLES: ArtStyle[] = [
  s('noir', 'Noir & shadow', 'Heavy blacks, moody light.', 'dark-victory', { tone: 0.85, violence: 0.55, artForward: 0.7 }),
  s('painterly', 'Painterly', 'Lush, painted pages.', 'kingdom-come', { artForward: 0.92 }),
  s('clean-cinematic', 'Clean & cinematic', 'Confident lines, big moments.', 'all-star', { artForward: 0.75, pace: 0.6 }),
  s('detailed', 'Detailed & epic', 'Every panel packed with detail.', 'coie', { artForward: 0.85, complexity: 0.7 }),
  s('classic', 'Classic comic', 'Timeless, bold, retro.', 'new-frontier', { tone: 0.35, complexity: 0.4 }),
  s('modern-superhero', 'Modern superhero', 'Big, polished, dynamic.', 'hush', { scale: 0.65, pace: 0.7 }),
  s('experimental', 'Experimental', 'Mixed media, unusual layouts.', 'batman-arkham-asylum', { artForward: 0.85, complexity: 0.85 }),
  s('horror-gritty', 'Horror & gritty', 'Rough, unsettling, raw.', 'cult', { tone: 0.9, violence: 0.8 }),
  s('bright-colorful', 'Bright & colorful', 'Playful, vivid and warm.', 'ms-marvel-no-normal', { tone: 0.15, violence: 0.2 }),
  s('manga', 'Manga-influenced', 'Kinetic, expressive, cinematic.', 'akira-vol1', { pace: 0.8, artForward: 0.7 }),
  s('minimal-graphic', 'Minimal & graphic', 'Bold shapes, few lines.', 'hellboy-wake-devil', { artForward: 0.6, complexity: 0.4 }),
  s('cosmic-psychedelic', 'Cosmic & psychedelic', 'Vast, strange, dazzling.', 'new-gods-kirby', { scale: 0.92, complexity: 0.7, artForward: 0.8 }),
];

export interface GenreCard { kind: 'genre'; id: string; label: string; genres: string[]; exemplarWorkId: string }

const g = (slug: string, label: string, genres: string[], exemplarWorkId: string): GenreCard =>
  ({ kind: 'genre', id: `genre:${slug}`, label, genres, exemplarWorkId });

/** Only genres the catalog actually carries, so a pick can change a recommendation. */
export const GENRE_CARDS: GenreCard[] = [
  g('detective', 'Detective & mystery', ['detective', 'mystery'], 'long-halloween'),
  g('crime', 'Crime', ['crime'], 'gotham-central-vol1'),
  g('horror', 'Horror', ['horror'], 'wytches-one'),
  g('superhero', 'Superhero', ['heroic'], 'all-star'),
  g('cosmic', 'Cosmic', ['cosmic'], 'infinity-gauntlet'),
  g('sci-fi', 'Sci-fi', ['sci-fi'], 'saga-vol1'),
  g('mythic', 'Myth & gods', ['mythic', 'gods'], 'thor-god-butcher'),
  g('street', 'Street-level', ['street_level'], 'dd-bendis'),
  g('political', 'Political & satire', ['political', 'satire'], 'v-for-vendetta'),
  g('drama', 'Character drama', ['drama'], 'vision-tom-king'),
  g('comedy', 'Comedy', ['comedy'], 'sex-criminals-vol1'),
  g('supernatural', 'Supernatural', ['supernatural'], 'swamp-thing'),
  g('multiverse', 'Multiverse & reality-bending', ['multiverse', 'reality_warping'], 'multiversity'),
  g('apocalypse', 'Apocalypse & dystopia', ['apocalypse', 'dystopia'], 'old-man-logan'),
  g('war', 'War', ['war'], 'maus'),
];

export interface StoryTrait { kind: 'trait'; id: string; label: string; seeds: DimSeeds; genres: string[] }

const t = (slug: string, label: string, seeds: DimSeeds, genres: string[] = []): StoryTrait => ({ kind: 'trait', id: `trait:${slug}`, label, seeds, genres });

export const STORY_TRAITS: StoryTrait[] = [
  t('characters', 'Great characters', {}, ['drama']),
  t('artwork', 'Amazing artwork', { artForward: 0.85 }),
  t('mystery', 'Mystery', { mystery: 0.8 }, ['mystery', 'detective']),
  t('big-ideas', 'Big ideas', { complexity: 0.8 }, ['sci-fi']),
  t('action', 'Action', { pace: 0.85 }),
  t('emotional', 'Emotional stories', {}, ['drama']),
  t('dark', 'Dark atmosphere', { tone: 0.85 }),
  t('worldbuilding', 'Worldbuilding', { scale: 0.75, complexity: 0.65 }),
  t('villains', 'Great villains', {}),
  t('violence', 'Violence', { violence: 0.8 }),
  t('humor', 'Humor', { tone: 0.2 }, ['comedy']),
  t('relationships', 'Relationships', {}, ['drama']),
  t('twists', 'Twists', { mystery: 0.7, complexity: 0.65 }),
  t('epic', 'Epic scale', { scale: 0.9 }),
];

export type Entity = CharacterEntity | CreatorEntity;

export const CHARACTER_BY_ID = new Map(CHARACTERS.map((x) => [x.id, x]));
export const CREATOR_BY_ID = new Map(CREATORS.map((x) => [x.id, x]));
