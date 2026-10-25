// A focused Marvel/DC expansion: 100 distinct works from each publisher.
//
// These are deliberately individual stories or non-overlapping run volumes,
// not alternate printings of books already in the catalog.  The `links`
// below are conservative, plot/run-continuity connections to existing works
// and to other additions.  We only make a direct-sequel edge where its order
// is useful to a reader; broad universe membership is not a reading order.
import type { Dim, EdgeType, Universe } from '../../types/domain';

type Publisher = 'DC' | 'Marvel';

export interface MarvelDcExpansionRow {
  id: string;
  title: string;
  lane: 'dc-popular' | 'marvel-popular';
  laneName: string;
  universe: Universe;
  order: number;
  own: 'none'; status: 'none'; format: 'physical';
  formatWhy: string; note: string; flag: null;
  fp: Record<Dim, number>;
  genres: string[];
  creators: string[];
  characters: string[];
  keeper: true;
}

export interface MarvelDcExpansionEdge {
  fromWork: string;
  toWork: string;
  type: EdgeType;
  confirmed: true;
}

const DC_TITLES = `
Batman: Year Two
Batman: Shaman
Batman: Prey
Batman: Terror
Batman: Knightfall Vol. 1
Batman: Knightquest
Batman: KnightsEnd
Batman: Prodigal
Batman: Troika
Batman: No Man's Land Vol. 2
Batman: No Man's Land Vol. 3
Batman: No Man's Land Vol. 4
Batman: Murderer?
Batman: Fugitive
Batman: War Games Book Two
Batman: War Crimes
Batman: Heart of Hush
Batman: Battle for the Cowl
Batman: The Return of Bruce Wayne
Batman: The Black Casebook
Batman Incorporated Vol. 1
Batman: City of Owls
Batman: Zero Year
Batman: Endgame
Batman: Superheavy
Batman: Bloom
Batman: I Am Gotham
Batman: I Am Suicide
Batman: I Am Bane
Batman: The War of Jokes and Riddles
Batman: Cold Days
Batman: City of Bane
Batman: Their Dark Designs
Batman: The Joker War
Batman: Fear State
Batman: The Knight
Batman: One Dark Knight
The Batman Who Laughs
Batman: Last Knight on Earth
Batman: Curse of the White Knight
Batman: White Knight Presents: Harley Quinn
Batman Beyond: The White Knight
Batman: The Adventures Continue Season One
Batman '66
Batman: The Dark Knight Strikes Again
The Dark Knight III: The Master Race
Superman: For Tomorrow
Superman: The Man of Steel Vol. 2
Superman: Exile
The Death of Superman
Superman: Funeral for a Friend
Superman: Reign of the Supermen
The Return of Superman
Superman: Secret Origin
Superman: Lois and Clark
Superman: Reborn
Superman: The Unity Saga: The House of El
Superman: Son of Kal-El Vol. 1
The Legend of Wonder Woman
Wonder Woman: Year One
Wonder Woman: The Lies
Wonder Woman: The Truth
Wonder Woman: The Witching Hour
Wonder Woman: The Just War
Wonder Woman: The Twelve Labors
Wonder Woman: Warbringer
The Flash: Year One
The Flash: Rogue War
The Flash: The Dastardly Death of the Rogues
The Flash: Move Forward
The Flash: The Button
The Flash: Flash War
The Flash: Finish Line
Green Lantern: Secret Origin
Green Lantern: Rage of the Red Lanterns
Green Lantern: Agent Orange
Green Lantern: Brightest Day
Green Lantern: New Guardians Vol. 1
Green Lanterns Vol. 1: Rage Planet
Sinestro Vol. 1: The Demon Within
Green Lantern: Revenge of the Green Lanterns
Green Lantern Corps: Recharge
Aquaman: The Others
Aquaman: Throne of Atlantis
Aquaman: Death of a King
Aquaman: Rebirth Vol. 1
Aquaman: The Drowned
Justice League: The Villain's Journey
Justice League: Trinity War
Forever Evil
Justice League: Injustice League
Justice League: No Justice
Justice League: The Totality
Justice League Dark Vol. 1: The Last Age of Magic
Teen Titans: Year One
The New Teen Titans: The Terror of Trigon
The New Teen Titans: Who Is Donna Troy?
Teen Titans by Geoff Johns Book One
Suicide Squad: Trial by Fire
JSA: Thy Kingdom Come
`.trim().split('\n');

const MARVEL_TITLES = `
Amazing Spider-Man: If This Be My Destiny
Amazing Spider-Man: Spider-Man No More
Amazing Spider-Man: The Death of Captain Stacy
Amazing Spider-Man: The Original Clone Saga
Spider-Man: The Kid Who Collects Spider-Man
Spider-Man: Maximum Carnage
Spider-Man: The Lost Years
Spider-Man: The Clone Conspiracy
Amazing Spider-Man: The Gauntlet Vol. 2
Amazing Spider-Man: Big Time Vol. 2
Amazing Spider-Man: Big Time Vol. 3
Spider-Man: Dying Wish
Superior Spider-Man Vol. 2: A Troubled Mind
Superior Spider-Man Vol. 3: No Escape
Superior Spider-Man Vol. 4: Necessary Evil
Amazing Spider-Man Vol. 1: The Parker Luck
Amazing Spider-Man Vol. 2: Spider-Verse
Spider-Man: Spider-Verse
Spider-Geddon
Amazing Spider-Man: Beyond Vol. 1
Amazing Spider-Man: Gang War
Ultimate Spider-Man Vol. 2: Learning Curve
Ultimate Spider-Man Vol. 3: Double Trouble
Ultimate Six
Ultimate Spider-Man: Death of Spider-Man
Ultimate Comics Spider-Man Vol. 1
Miles Morales: Ultimate Spider-Man Vol. 2
Miles Morales: Spider-Man Vol. 2: Bring on the Bad Guys
Spider-Gwen Vol. 2: Weapon of Choice
Ghost-Spider Vol. 1: Dog Days Are Over
Venom: Dark Origin
Venom: Space Knight Vol. 1
Absolute Carnage
King in Black
Daredevil: The Elektra Saga
Daredevil: Underboss
Daredevil: Out
Daredevil: The Golden Age
Daredevil: Back in Black Vol. 1
Daredevil: Supreme
Daredevil: Woman Without Fear
Elektra: Root of Evil
Punisher: Year One
The Punisher: Circle of Blood
The Punisher: The Platoon
Moon Knight: Lunatic
Moon Knight: Dead Will Rise
Moon Knight: The Midnight Mission
Moon Knight: Too Tough to Die
Captain America: Reborn
Captain America: The Chosen
Captain America: The Captain
Captain America: Symbol of Truth Vol. 1
Captain America: Cold War
Iron Man: Armor Wars
Iron Man: Director of S.H.I.E.L.D.
Iron Man: The Inevitable
Iron Man: Haunted
Iron Man: Fatal Frontier
Thor: Godbomb
Thor: God of Thunder Reborn
The Mighty Thor Vol. 2: Lords of Midgard
Thor: War of the Realms
Journey into Mystery Vol. 1
Loki: Agent of Asgard Vol. 2
Doctor Strange: The Last Days of Magic
Doctor Strange: Blood in the Aether
Doctor Strange: Damnation
Doctor Strange: Surgeon Supreme Vol. 1
Black Panther: A Nation Under Our Feet Vol. 2
Black Panther: World of Wakanda
Black Panther: Avengers of the New World Vol. 1
Black Panther: Intergalactic Empire of Wakanda
Black Panther: The Long Shadow
Fantastic Four: The Coming of Galactus
Fantastic Four: The Peril and the Power
Fantastic Four: The Black Panther
Fantastic Four: Into the Time Stream
Fantastic Four: The New Fantastic Four
Avengers: The Final Host
Avengers: World Tour
Avengers: No Surrender
Avengers: No Road Home
The Infinity War
Secret Invasion
Dark Reign
Siege
Avengers vs. X-Men
Age of Ultron
World War Hulk
X-Men: Days of Future Past
X-Men: Mutant Massacre
X-Men: Fall of the Mutants
X-Men: Inferno
X-Men: Age of Apocalypse
X-Men: Messiah Complex
X-Men: Messiah War
X-Men: Second Coming
X-Men: Schism
X of Swords
`.trim().split('\n');

// A second pass concentrates on well-known runs and event-adjacent books that
// close useful gaps left by the first expansion.  Keep these as distinct works
// rather than alternate printings of titles already in the catalog.
const DC_1000_TITLES = `
Batman: Nightwalker
Batman: The Dark Knight Detective Vol. 1
Batman: Sword of Azrael
Batman: The Detective Vol. 1
Batman: Year 100
Batman: Cataclysm
Batman: Road to No Man's Land
Batman: Blind Justice
Batman: The Abduction
Batman: Castle of the Bat
Batman: The Black Glove
Batman: The Chalice
Batman: Time and the Batman
Batman: The Road Home
Batman: The Hill
Batman: Night of the Owls
Batman: The Dark Knight Vol. 1: Knight Terrors
Batman: The Dark Knight Vol. 2: Cycle of Violence
Batman: Detective Comics Vol. 1: Faces of Death
Batman: Detective Comics Vol. 2: Scare Tactics
Batman: Detective Comics Vol. 3: Emperor Penguin
Batman Eternal Vol. 1
Batman & Robin Eternal Vol. 1
Batman: Rules of Engagement
Batman: Bride or Burglar
Batman: The Tyrant Wing
Batman: The Cowardly Lot
Batman: The Abyss
Batman: Failsafe
Batman: The Bat-Man of Gotham
Batman: Mindbomb
Batman: Gotham War
Batman: Off-World
Batman: Dark Prisons
Batman: Absolute Power
Batman: Dark Patterns
Batman: Full Moon
Superman: Kryptonite
Superman: Last Son
Superman: Escape from Bizarro World
Superman: Camelot Falls Vol. 1
Superman: Camelot Falls Vol. 2
Superman: Up, Up and Away
Superman: Grounded Vol. 1
Superman: Doomed
Superman: Savage Dawn
Superman: The Final Days of Superman
Superman: Action Comics Vol. 1: Superman and the Men of Steel
Superman: Action Comics Vol. 2: Bulletproof
Superman: Action Comics Vol. 3: At the End of Days
Superman: The Unity Saga: The Truth Revealed
Superman: The Warworld Saga
Superman: Kal-El Returns
Superman: The Last Days of Lex Luthor
Superman: House of Brainiac
Superman: The Authority
Superman: The Coming of the Supermen
Superman: The Phantom Zone
Wonder Woman: Challenge of the Gods
Wonder Woman: The Contest
Wonder Woman: Rise of the Olympian
Wonder Woman: Odyssey Vol. 1
Wonder Woman: The Four Horsewomen
Wonder Woman: Guts
Wonder Woman: War
Wonder Woman: Iron
Wonder Woman: Heart of the Amazon
Wonder Woman: Trial of the Amazons
Wonder Woman: The Villainy of Our Fears
Wonder Woman: Outlaw
Wonder Woman: The Last Amazon
Wonder Woman: Sacrifice
The Flash: Born to Run
The Flash: The Return of Wally West
The Flash: Dead Heat
The Flash: The Secret of Barry Allen
The Flash: Wonderland
The Flash: Rogue Profile
The Flash: Ignition
The Flash: Lightning Strikes Twice
The Flash: Speed of Darkness
The Flash: Rogues Reloaded
The Flash: Force Quest
The Flash: Death of the Speed Force
The Flash: The Flash Age
The Flash: One Minute War
Green Lantern: Emerald Twilight
Green Lantern: A New Dawn
Green Lantern: Day of Judgment
Green Lantern: The Alpha War
Green Lantern: Rise of the Third Army
Green Lantern: Wrath of the First Lantern
Aquaman: Time and Tide
Aquaman: Sub-Diego
Aquaman: Sea of Storms
Aquaman: Maelstrom
Aquaman: Once and Future
Aquaman: The Becoming
JLA: Tower of Babel
JLA: The Obsidian Age
`.trim().split('\n');

const MARVEL_1000_TITLES = `
Amazing Spider-Man: The Master Planner Saga
Amazing Spider-Man: The Lifeline Tablet Saga
Spider-Man: The Death of Jean DeWolff
Spider-Man: The Wedding
Spider-Man: The Alien Costume Saga
Spider-Man: Revenge of the Sinister Six
Spider-Man: The Child Within
Spider-Man: Funeral Arrangements
Spider-Man: The Final Adventure
Spider-Man: Identity Crisis
Spider-Man: Happy Birthday
Spider-Man: Back in Black
Spider-Man: One More Day
Amazing Spider-Man: Brand New Day Vol. 2
Amazing Spider-Man: Revenge of the Spider-Slayer
Superior Spider-Man Vol. 5: Superior Venom
Amazing Spider-Man Vol. 4: Graveyard Shift
Amazing Spider-Man Vol. 5: Spiral
Amazing Spider-Man: Worldwide Vol. 1
Amazing Spider-Man: Red Goblin
Amazing Spider-Man: Hunted
Amazing Spider-Man: Sins Rising
Amazing Spider-Man: Last Remains
Amazing Spider-Man: Sinister War
Amazing Spider-Man: Beyond Vol. 2
Ultimate Spider-Man Vol. 4: Legacy
Ultimate Spider-Man Vol. 5: Public Scrutiny
Ultimate Spider-Man Vol. 6: Venom
Ultimate Spider-Man (2024) Vol. 1: Married with Children
Spider-Man 2099 Vol. 1: Out of Time
Spider-Gwen: Ghost-Spider Vol. 1: Spider-Geddon
Spider-Gwen Vol. 3: Long Distance
Spider-Gwen Vol. 4: Predators
Spider-Gwen Vol. 5: Gwentervention
Ghost-Spider Vol. 2: Impossible Year
Venom: The Hunted
Venom: Separation Anxiety
Venom Vol. 2: The Abyss
Venom Vol. 4: Venom Island
Venom Vol. 5: Venom Beyond
Daredevil: Noir
Daredevil: Hardcore
Daredevil: Lowlife
Daredevil: The Devil in Cell Block D
Daredevil Vol. 1: Devil at Bay
Daredevil Vol. 2: No Devils, Only God
Daredevil Vol. 3: Through Hell
Daredevil Vol. 4: End of Hell
Daredevil Vol. 5: Truth/Dare
Daredevil Vol. 6: Doing Time
Daredevil Vol. 7: Lockdown
Elektra: Black, White & Red
Elektra: Glimpse and Echo
Moon Knight: The Bottom
Moon Knight: Midnight Sun
Moon Knight: Shadowland
Moon Knight: Black, White & Blood
Punisher: Frankencastle
Punisher: Soviet
Punisher War Journal Vol. 1
Punisher: The Tyger
Punisher: The End
Captain America: Sentinel of Liberty Vol. 1
Captain America: Living Legend
Captain America: American Dreams
Captain America: Steve Rogers Vol. 1: Hail Hydra
Captain America: Sam Wilson Vol. 1: Not My Captain America
Iron Man: The Mask in the Iron Man
Iron Man: Doomquest
Iron Man: The Five Nightmares
Iron Man: The Knaufs
Iron Man: The Future
Thor: The Eternals Saga
Thor: Blood and Thunder
Thor: Disassembled
Thor: The Devourer King
Loki: The God of Stories
Doctor Strange: Fall Sunrise
Doctor Strange: The Way of the Weird
Fantastic Four: The World's Greatest Comic Magazine
Fantastic Four: Full Circle
Fantastic Four: Antithesis
Fantastic Four: Authoritative Action
Fantastic Four: Road Trip
Avengers: The Celestial Madonna
Avengers/Defenders War
Avengers: Disassembled
Avengers: The Initiative
Mighty Avengers Vol. 1: The Ultron Initiative
X-Men: Proteus
X-Men: The Brood Saga
X-Men: Mutant Genesis
X-Men: Fatal Attractions
X-Men: The Phalanx Covenant
X-Men: Onslaught
New X-Men: Riot at Xavier's
Astonishing X-Men Vol. 2: Dangerous
Astonishing X-Men Vol. 3: Torn
Astonishing X-Men Vol. 4: Unstoppable
X-Men: Red Vol. 1: The Hate Machine
`.trim().split('\n');

const fingerprint: Record<Publisher, Record<Dim, number>> = {
  DC: { tone: .48, violence: .45, scale: .48, complexity: .48, mystery: .46, pace: .55, artForward: .7, commitment: .45 },
  Marvel: { tone: .46, violence: .46, scale: .5, complexity: .46, mystery: .4, pace: .58, artForward: .68, commitment: .45 },
};

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function people(title: string, publisher: Publisher): { creators: string[]; characters: string[]; genres: string[] } {
  const lower = title.toLowerCase();
  if (lower.includes('batman')) return { creators: [], characters: ['Batman'], genres: ['crime', 'detective', 'heroic'] };
  if (lower.includes('superman')) return { creators: [], characters: ['Superman'], genres: ['heroic', 'sci-fi', 'drama'] };
  if (lower.includes('wonder woman')) return { creators: [], characters: ['Wonder Woman'], genres: ['heroic', 'mythic', 'drama'] };
  if (lower.includes('flash')) return { creators: [], characters: ['The Flash'], genres: ['heroic', 'sci-fi'] };
  if (lower.includes('green lantern') || lower.includes('sinestro')) return { creators: [], characters: ['Green Lantern'], genres: ['heroic', 'cosmic', 'sci-fi'] };
  if (lower.includes('aquaman')) return { creators: [], characters: ['Aquaman'], genres: ['heroic', 'sci-fi'] };
  if (lower.includes('spider') || lower.includes('venom') || lower.includes('carnage')) return { creators: [], characters: ['Spider-Man'], genres: ['heroic', 'crime', 'drama'] };
  if (lower.includes('daredevil') || lower.includes('elektra') || lower.includes('punisher') || lower.includes('moon knight')) return { creators: [], characters: [lower.includes('punisher') ? 'The Punisher' : lower.includes('moon knight') ? 'Moon Knight' : 'Daredevil'], genres: ['crime', 'street_level', 'drama'] };
  if (lower.includes('x-men') || lower.includes('mutant') || lower.includes('x of swords')) return { creators: [], characters: ['X-Men'], genres: ['heroic', 'sci-fi', 'drama'] };
  if (lower.includes('thor') || lower.includes('loki')) return { creators: [], characters: [lower.includes('loki') ? 'Loki' : 'Thor'], genres: ['heroic', 'mythic', 'cosmic'] };
  if (lower.includes('avengers') || ['secret invasion', 'dark reign', 'siege', 'age of ultron'].includes(lower)) return { creators: [], characters: ['Avengers'], genres: ['heroic', 'sci-fi', 'cosmic'] };
  return { creators: [], characters: [publisher === 'DC' ? 'DC Universe' : 'Marvel Universe'], genres: ['heroic', 'drama'] };
}

function rows(titles: string[], publisher: Publisher, collection: 800 | 1000): MarvelDcExpansionRow[] {
  const lane = publisher === 'DC' ? 'dc-popular' : 'marvel-popular';
  return titles.map((title, index) => ({
    id: `${publisher.toLowerCase()}-${collection}-${slug(title)}`,
    title, lane, laneName: publisher === 'DC' ? 'Popular DC picks' : 'Popular Marvel picks',
    universe: 'main', order: (collection === 800 ? 2000 : 4000) + index * 10, own: 'none', status: 'none', format: 'physical',
    formatWhy: 'A physical edition suits this collection-worthy read.', note: '', flag: null,
    fp: fingerprint[publisher], ...people(title, publisher), keeper: true,
  }));
}

export const MARVEL_DC_EXPANSION_ROWS = [
  ...rows(DC_TITLES, 'DC', 800),
  ...rows(MARVEL_TITLES, 'Marvel', 800),
  ...rows(DC_1000_TITLES, 'DC', 1000),
  ...rows(MARVEL_1000_TITLES, 'Marvel', 1000),
];

const dc = (title: string) => `dc-800-${slug(title)}`;
const marvel = (title: string) => `marvel-800-${slug(title)}`;
const dc1000 = (title: string) => `dc-1000-${slug(title)}`;
const marvel1000 = (title: string) => `marvel-1000-${slug(title)}`;
const sequel = (fromWork: string, toWork: string): MarvelDcExpansionEdge => ({ fromWork, toWork, type: 'direct_sequel', confirmed: true });

export const MARVEL_DC_EXPANSION_EDGES: MarvelDcExpansionEdge[] = [
  sequel('batman-venom', dc('Batman: Knightfall Vol. 1')),
  sequel(dc('Batman: Knightfall Vol. 1'), dc('Batman: Knightquest')),
  sequel(dc('Batman: Knightquest'), dc('Batman: KnightsEnd')),
  sequel(dc('Batman: KnightsEnd'), dc('Batman: Prodigal')),
  sequel(dc('Batman: Prodigal'), dc('Batman: Troika')),
  sequel('popular-600-batman-no-man-s-land-vol-1', dc("Batman: No Man's Land Vol. 2")),
  sequel(dc("Batman: No Man's Land Vol. 2"), dc("Batman: No Man's Land Vol. 3")),
  sequel(dc("Batman: No Man's Land Vol. 3"), dc("Batman: No Man's Land Vol. 4")),
  sequel(dc('Batman: Murderer?'), dc('Batman: Fugitive')),
  sequel('popular-600-batman-war-games-vol-1', dc('Batman: War Games Book Two')),
  sequel(dc('Batman: War Games Book Two'), dc('Batman: War Crimes')),
  sequel('hush', dc('Batman: Heart of Hush')),
  sequel(dc('Batman: Battle for the Cowl'), 'batman-robin-reborn'),
  sequel('batman-court-of-owls', dc('Batman: City of Owls')),
  sequel(dc('Batman: City of Owls'), 'death-of-family'),
  sequel(dc('Batman: Endgame'), dc('Batman: Superheavy')),
  sequel(dc('Batman: Superheavy'), dc('Batman: Bloom')),
  sequel(dc('Batman: I Am Gotham'), dc('Batman: The War of Jokes and Riddles')),
  sequel(dc('Batman: The War of Jokes and Riddles'), dc('Batman: I Am Suicide')),
  sequel(dc('Batman: I Am Suicide'), dc('Batman: I Am Bane')),
  sequel(dc('Batman: I Am Bane'), dc('Batman: Cold Days')),
  sequel(dc('Batman: Cold Days'), dc('Batman: City of Bane')),
  sequel(dc('Batman: Their Dark Designs'), dc('Batman: The Joker War')),
  sequel(dc('Batman: The Joker War'), dc('Batman: Fear State')),
  sequel('white-knight', dc('Batman: Curse of the White Knight')),
  sequel(dc('Batman: Curse of the White Knight'), dc('Batman: White Knight Presents: Harley Quinn')),
  sequel(dc('Batman: White Knight Presents: Harley Quinn'), dc('Batman Beyond: The White Knight')),
  sequel('dark-knight-returns', dc('Batman: The Dark Knight Strikes Again')),
  sequel(dc('Batman: The Dark Knight Strikes Again'), dc('The Dark Knight III: The Master Race')),
  sequel(dc('The Death of Superman'), dc('Superman: Funeral for a Friend')),
  sequel(dc('Superman: Funeral for a Friend'), dc('Superman: Reign of the Supermen')),
  sequel(dc('Superman: Reign of the Supermen'), dc('The Return of Superman')),
  sequel('gl-rebirth', 'gl-sinestro-corps'),
  sequel('gl-sinestro-corps', dc('Green Lantern: Rage of the Red Lanterns')),
  sequel(dc('Green Lantern: Rage of the Red Lanterns'), dc('Green Lantern: Agent Orange')),
  sequel('aquaman-trench', dc('Aquaman: The Others')),
  sequel(dc('Aquaman: The Others'), dc('Aquaman: Throne of Atlantis')),
  sequel(dc('Aquaman: Throne of Atlantis'), dc('Aquaman: Death of a King')),
  sequel('jl-origin', dc('Justice League: The Villain\'s Journey')),
  sequel(dc('Justice League: The Villain\'s Journey'), dc('Justice League: Trinity War')),
  sequel(dc('Justice League: Trinity War'), dc('Forever Evil')),
  sequel(marvel('Spider-Man: Dying Wish'), 'superior-spider-man-one'),
  sequel('superior-spider-man-one', marvel('Superior Spider-Man Vol. 2: A Troubled Mind')),
  sequel(marvel('Superior Spider-Man Vol. 2: A Troubled Mind'), marvel('Superior Spider-Man Vol. 3: No Escape')),
  sequel(marvel('Superior Spider-Man Vol. 3: No Escape'), marvel('Superior Spider-Man Vol. 4: Necessary Evil')),
  sequel('spider-gwen-greater-power', marvel('Spider-Gwen Vol. 2: Weapon of Choice')),
  sequel(marvel('Spider-Gwen Vol. 2: Weapon of Choice'), marvel('Ghost-Spider Vol. 1: Dog Days Are Over')),
  sequel('venom-rex', marvel('Absolute Carnage')),
  sequel(marvel('Absolute Carnage'), marvel('King in Black')),
  sequel('cap-winter-soldier', 'captain-america-death'),
  sequel('captain-america-death', marvel('Captain America: Reborn')),
  sequel('thor-god-butcher', marvel('Thor: Godbomb')),
  sequel(marvel('Thor: Godbomb'), 'thor-goddess'),
  sequel('popular-600-new-avengers-breakout', 'civil-war'),
  sequel('civil-war', marvel('Secret Invasion')),
  sequel(marvel('Secret Invasion'), marvel('Dark Reign')),
  sequel(marvel('Dark Reign'), marvel('Siege')),
  sequel('planet-hulk', marvel('World War Hulk')),
  sequel('infinity-gauntlet', marvel('The Infinity War')),
  sequel('uncanny-xmen-claremont', 'xmen-dark-phoenix'),
  sequel('xmen-dark-phoenix', marvel('X-Men: Days of Future Past')),
  sequel(marvel('X-Men: Days of Future Past'), marvel('X-Men: Mutant Massacre')),
  sequel(marvel('X-Men: Mutant Massacre'), marvel('X-Men: Fall of the Mutants')),
  sequel(marvel('X-Men: Fall of the Mutants'), marvel('X-Men: Inferno')),
  sequel('hox-pox', marvel('X of Swords')),
  sequel(dc1000('Batman: Sword of Azrael'), dc('Batman: Knightfall Vol. 1')),
  sequel(dc1000('Batman: Cataclysm'), dc1000("Batman: Road to No Man's Land")),
  sequel(dc1000("Batman: Road to No Man's Land"), 'popular-600-batman-no-man-s-land-vol-1'),
  sequel(dc1000('Batman: Night of the Owls'), 'death-of-family'),
  sequel(dc1000('Superman: Camelot Falls Vol. 1'), dc1000('Superman: Camelot Falls Vol. 2')),
  sequel(dc1000('Superman: Doomed'), dc1000('Superman: Savage Dawn')),
  sequel(dc1000('Superman: Savage Dawn'), dc1000('Superman: The Final Days of Superman')),
  sequel(dc1000('Superman: The Unity Saga: The Truth Revealed'), dc1000('Superman: The Warworld Saga')),
  sequel(dc('Wonder Woman: Year One'), dc('Wonder Woman: The Lies')),
  sequel(dc('Wonder Woman: The Lies'), dc('Wonder Woman: The Truth')),
  sequel(dc1000('Green Lantern: Emerald Twilight'), dc1000('Green Lantern: A New Dawn')),
  sequel(dc1000('Green Lantern: Rise of the Third Army'), dc1000('Green Lantern: Wrath of the First Lantern')),
  sequel(marvel1000('Amazing Spider-Man: The Master Planner Saga'), marvel('Amazing Spider-Man: Spider-Man No More')),
  sequel(marvel1000('Amazing Spider-Man: The Lifeline Tablet Saga'), marvel('Amazing Spider-Man: The Original Clone Saga')),
  sequel(marvel1000('Spider-Man: Back in Black'), marvel1000('Spider-Man: One More Day')),
  sequel(marvel('Superior Spider-Man Vol. 4: Necessary Evil'), marvel1000('Superior Spider-Man Vol. 5: Superior Venom')),
  sequel(marvel1000('Spider-Gwen: Ghost-Spider Vol. 1: Spider-Geddon'), marvel1000('Spider-Gwen Vol. 3: Long Distance')),
  sequel(marvel1000('Spider-Gwen Vol. 3: Long Distance'), marvel1000('Spider-Gwen Vol. 4: Predators')),
  sequel(marvel1000('Spider-Gwen Vol. 4: Predators'), marvel1000('Spider-Gwen Vol. 5: Gwentervention')),
  sequel(marvel1000('Daredevil: Lowlife'), marvel1000('Daredevil: The Devil in Cell Block D')),
  sequel(marvel1000('Thor: The Eternals Saga'), marvel1000('Thor: Blood and Thunder')),
  sequel('xmen-dark-phoenix', marvel1000('X-Men: The Brood Saga')),
  sequel(marvel1000('X-Men: Fatal Attractions'), marvel1000('X-Men: The Phalanx Covenant')),
  sequel(marvel1000('Astonishing X-Men Vol. 2: Dangerous'), marvel1000('Astonishing X-Men Vol. 3: Torn')),
  sequel(marvel1000('Astonishing X-Men Vol. 3: Torn'), marvel1000('Astonishing X-Men Vol. 4: Unstoppable')),
];
