// A third curated shelf expansion. These are catalog facts only: ownership
// and reading state deliberately remain empty for every user.
type Lane = 'dc-popular' | 'marvel-popular' | 'indie-popular' | 'manga-popular';

const LIST = `
dc-popular|Batman: The Doom That Came to Gotham
dc-popular|Batman: City of Crime
dc-popular|Batman: The Resurrection of Ra's al Ghul
dc-popular|Batman: The Strange Deaths of Batman
dc-popular|Batman: The Last Arkham
dc-popular|Batman: Officer Down
dc-popular|Batman: Private Casebook
dc-popular|Batman: Full Circle
dc-popular|Batman: Face the Face
dc-popular|Batman: Broken City
dc-popular|Batman: The Ultimate Evil
dc-popular|Batman: Blink
dc-popular|Batman: Going Sane
dc-popular|Batman: The Twelve-Cent Adventure
dc-popular|Batman: Snow
dc-popular|Batman: No Man's Land Vol. 1
dc-popular|Batman: Contagion
dc-popular|Batman: Legacy
dc-popular|Batman: War Games Vol. 1
dc-popular|Batman: Gates of Gotham
dc-popular|Batman: The Detective
dc-popular|Batman: One Bad Day - The Riddler
dc-popular|Batman: One Bad Day - Mr. Freeze
dc-popular|Batman: One Bad Day - Two-Face
dc-popular|Batman: One Bad Day - The Penguin
dc-popular|Superman: Kryptonite Nevermore
dc-popular|Superman: The Last Son
dc-popular|Superman: Camelot Falls
dc-popular|Superman: Emperor Joker
dc-popular|Superman: Panic in the Sky
dc-popular|Superman: Ending Battle
dc-popular|Superman: Last Son of Krypton
dc-popular|Superman: Man of Steel Vol. 1
dc-popular|Superman: The Black Ring Vol. 1
dc-popular|Superman: Unchained
dc-popular|Superman: Lost
dc-popular|Superman: Space Age
dc-popular|Action Comics: Superman and the Men of Steel
dc-popular|Action Comics: The Warworld Saga
dc-popular|Wonder Woman: Earth One Vol. 1
dc-popular|Wonder Woman: Black and Gold
dc-popular|Wonder Woman: The Circle
dc-popular|Wonder Woman: Blood
dc-popular|Wonder Woman: Paradise Lost
dc-popular|The Flash: Terminal Velocity
dc-popular|The Flash: Blitz
dc-popular|The Flash: The Return of Barry Allen
dc-popular|Green Arrow: Year One
dc-popular|Green Arrow: Quiver
dc-popular|Justice League: The World's Greatest Superheroes
marvel-popular|Amazing Spider-Man: The Night Gwen Stacy Died
marvel-popular|Amazing Spider-Man: The Death of Jean DeWolff
marvel-popular|Amazing Spider-Man: The Gauntlet Vol. 1
marvel-popular|Amazing Spider-Man: Big Time Vol. 1
marvel-popular|Amazing Spider-Man: Spider-Island
marvel-popular|Amazing Spider-Man: Renew Your Vows
marvel-popular|Amazing Spider-Man: The Clone Saga
marvel-popular|Amazing Spider-Man: The Wedding Album
marvel-popular|Amazing Spider-Man: Happy Birthday
marvel-popular|Spectacular Spider-Man: The Owl/Octopus War
marvel-popular|Spider-Man: Reign
marvel-popular|Spider-Man: Spider's Shadow
marvel-popular|Spider-Man: Tangled Web
marvel-popular|Spider-Man: The Other
marvel-popular|Spider-Man: Noir
marvel-popular|Spider-Man 2099 Vol. 1
marvel-popular|Venom: Lethal Protector
marvel-popular|Venom: The Hunger
marvel-popular|Carnage: Mind Bomb
marvel-popular|Carnage: It's a Wonderful Life
marvel-popular|Daredevil: Redemption
marvel-popular|Daredevil: Father
marvel-popular|Daredevil: Dark Nights
marvel-popular|Daredevil: The Devil, Inside and Out Vol. 1
marvel-popular|Elektra: The Hand
marvel-popular|Elektra: Black, White & Blood
marvel-popular|Captain America: Sentinel of Liberty
marvel-popular|Captain America: White
marvel-popular|Captain America: No Escape
marvel-popular|Captain America: Homeland
marvel-popular|The Avengers: Under Siege
marvel-popular|Avengers: Ultron Unlimited
marvel-popular|Avengers: Celestial Madonna
marvel-popular|Avengers: The Kree-Skrull War
marvel-popular|Avengers: The Initiative Vol. 1
marvel-popular|New Avengers: Breakout
marvel-popular|Young Avengers: Children's Crusade
marvel-popular|West Coast Avengers: Darker Than Scarlet
marvel-popular|Fantastic Four: Unthinkable
marvel-popular|Fantastic Four: Hereafter
marvel-popular|Fantastic Four: The End
marvel-popular|Fantastic Four: The Trial of Galactus
marvel-popular|Fantastic Four: Behold Galactus
marvel-popular|Silver Surfer: Requiem
marvel-popular|Silver Surfer: Judgment Day
marvel-popular|Guardians of the Galaxy: Tomorrow's Heroes Today
marvel-popular|Nova: Origin
marvel-popular|Thanos: The Infinity Revelation
marvel-popular|Thanos Wins
marvel-popular|The Eternals: The Complete Collection
indie-popular|The Goon Vol. 1: Nothin' But Misery
indie-popular|The Goon: Chinatown and the Mystery of Mr. Wicker
indie-popular|Hellblazer: Original Sins
indie-popular|Hellblazer: The Family Man
indie-popular|Hellblazer: Rake at the Gates of Hell
indie-popular|Swamp Thing: The Root of All Evil
indie-popular|Swamp Thing: Twin Branches
indie-popular|The Dreaming Vol. 1: Pathways and Emanations
indie-popular|The Books of Magic: Moveable Type
indie-popular|The Unwritten Vol. 1: Tommy Taylor and the Bogus Identity
indie-popular|The Unwritten: Leviathan
indie-popular|Scalped Vol. 1: Indian Country
indie-popular|Scalped: The Deluxe Edition Book One
indie-popular|Northlanders Vol. 1: Sven the Returned
indie-popular|American Vampire Vol. 1
indie-popular|American Vampire: Survival of the Fittest
indie-popular|The Sandman: The Dream Hunters
indie-popular|The Sandman: Endless Nights
indie-popular|The Sandman: The Kindly Ones
indie-popular|The Sandman: The Wake
indie-popular|The Invisibles: The Deluxe Edition Book One
indie-popular|The Losers Vol. 1: Ante Up
indie-popular|Global Frequency
indie-popular|The Authority: The Lost Year
indie-popular|Planetary: All Over the World and Other Stories
indie-popular|WildC.A.T.s: Homecoming
indie-popular|Astro City: Life in the Big City
indie-popular|Astro City: Confession
indie-popular|The Boys: Herogasm
indie-popular|The Boys: Dear Becky
indie-popular|Invincible: The Ultimate Collection Vol. 1
indie-popular|Saga: Book Two
indie-popular|Paper Girls: The Complete Story
indie-popular|Monstress: The Complete Collection
indie-popular|The Department of Truth: The Complete Conspiracy
indie-popular|Something Is Killing the Children Vol. 2
indie-popular|The Nice House on the Lake Vol. 2
indie-popular|Department of Truth: The Devil You Know
indie-popular|Criminal: The Last of the Innocent
indie-popular|Criminal: My Heroes Have Always Been Junkies
indie-popular|Reckless
indie-popular|Reckless: Friend of the Devil
indie-popular|Pulp
indie-popular|Kill or Be Killed Vol. 1
indie-popular|Fatale Vol. 1: Death Chases Me
indie-popular|Velvet Vol. 1: Before the Living End
indie-popular|Incognito
indie-popular|The Fade Out: Act One
indie-popular|The Sleeper and the Spindle
indie-popular|The Killing Jar
indie-popular|Murder Falcon
indie-popular|Extremity
indie-popular|Do a Powerbomb!
indie-popular|Murder Mysteries
indie-popular|A.D.: After Death
indie-popular|Tokyo Ghost Vol. 1: Atomic Garden
indie-popular|Low Vol. 1: The Delirium of Hope
indie-popular|Black Science Vol. 1: How to Fall Forever
indie-popular|Deadly Class Vol. 1: Reagan Youth
indie-popular|Seven to Eternity Vol. 1: The God of Whispers
indie-popular|The Old Guard Vol. 1: Opening Fire
indie-popular|The Magic Order Vol. 1
indie-popular|Jupiter's Legacy Vol. 1
indie-popular|Kick-Ass Vol. 1
indie-popular|Superior Vol. 1
indie-popular|Starlight
indie-popular|Huck
indie-popular|The Chilling Adventures of Sabrina Vol. 1
indie-popular|Afterlife with Archie Vol. 1
indie-popular|Archie Vol. 1
manga-popular|Dragon Ball Z Vol. 1
manga-popular|Boruto Vol. 1
manga-popular|Bleach Vol. 1
manga-popular|Fairy Tail Vol. 1
manga-popular|One-Punch Man Vol. 1
manga-popular|Mob Psycho 100 Vol. 1
manga-popular|JoJo's Bizarre Adventure Part 1 Vol. 1
manga-popular|JoJo's Bizarre Adventure Part 2 Vol. 1
manga-popular|JoJo's Bizarre Adventure Part 3 Vol. 1
manga-popular|Hunter x Hunter Vol. 1
manga-popular|Yu Yu Hakusho Vol. 1
manga-popular|Rurouni Kenshin Vol. 1
manga-popular|Inuyasha Vol. 1
manga-popular|Ranma 1/2 Vol. 1
manga-popular|Maison Ikkoku Collector's Edition Vol. 1
manga-popular|Komi Can't Communicate Vol. 1
manga-popular|My Dress-Up Darling Vol. 1
manga-popular|Skip and Loafer Vol. 1
manga-popular|A Sign of Affection Vol. 1
manga-popular|Orange: The Complete Collection Vol. 1
manga-popular|Your Lie in April Vol. 1
manga-popular|A Silent Voice Vol. 1
manga-popular|I Want to Eat Your Pancreas
manga-popular|My Lesbian Experience with Loneliness
manga-popular|My Brother's Husband Vol. 1
manga-popular|Our Dreams at Dusk Vol. 1
manga-popular|Princess Jellyfish Vol. 1
manga-popular|Nana Vol. 1
manga-popular|Paradise Kiss 20th Anniversary Edition
manga-popular|Uzumaki
manga-popular|Tomie: Complete Deluxe Edition
manga-popular|Gyo
manga-popular|The Drifting Classroom Vol. 1
manga-popular|The Summer Hikaru Died Vol. 1
manga-popular|Blood on the Tracks Vol. 1
manga-popular|Boy's Abyss Vol. 1
manga-popular|Homunculus Vol. 1
manga-popular|The Girl From the Other Side Vol. 1
manga-popular|To Your Eternity Vol. 1
manga-popular|Made in Abyss Vol. 1
manga-popular|Ranking of Kings Vol. 1
manga-popular|Frieren: Beyond Journey's End Vol. 2
manga-popular|The Apothecary Diaries Vol. 1
manga-popular|My Happy Marriage Vol. 1
manga-popular|The Case Study of Vanitas Vol. 1
manga-popular|The Ancient Magus' Bride Vol. 1
manga-popular|Noragami Vol. 1
manga-popular|Soul Eater Perfect Edition Vol. 1
manga-popular|Fire Force Omnibus Vol. 1
manga-popular|Dorohedoro Vol. 1
manga-popular|Beastars Vol. 1
manga-popular|Ajin: Demi-Human Vol. 1
manga-popular|Golden Kamuy Vol. 1
manga-popular|Hellsing Deluxe Edition Vol. 1
manga-popular|Black Clover Vol. 1
manga-popular|Dr. STONE Vol. 1
manga-popular|Undead Unluck Vol. 1
`.trim().split('\n') as `${Lane}|${string}`[];

const META: Record<Lane, { universe: 'main' | 'standalone'; fp: Record<string, number>; genres: string[] }> = {
  'dc-popular': { universe: 'main', fp: { tone: .5, violence: .42, scale: .4, complexity: .45, mystery: .45, pace: .52, artForward: .7, commitment: .4 }, genres: ['heroic', 'drama'] },
  'marvel-popular': { universe: 'main', fp: { tone: .48, violence: .45, scale: .45, complexity: .45, mystery: .42, pace: .55, artForward: .68, commitment: .42 }, genres: ['heroic', 'drama'] },
  'indie-popular': { universe: 'standalone', fp: { tone: .62, violence: .42, scale: .28, complexity: .5, mystery: .48, pace: .45, artForward: .78, commitment: .35 }, genres: ['drama', 'mystery'] },
  'manga-popular': { universe: 'standalone', fp: { tone: .42, violence: .35, scale: .35, complexity: .4, mystery: .32, pace: .58, artForward: .75, commitment: .65 }, genres: ['drama', 'mythic'] },
};

const slug = (title: string) => `popular-600-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;

export const MORE_POPULAR_ROWS = LIST.map((line, index) => {
  const [lane, title] = line.split('|') as [Lane, string];
  const meta = META[lane];
  return {
    id: slug(title), title, lane, laneName: lane.replace('-popular', ' popular picks'),
    universe: meta.universe, order: 1000 + index * 10, own: 'none', status: 'none', format: 'physical',
    formatWhy: 'A physical edition suits this collection-worthy read.', note: '', flag: null,
    fp: meta.fp, genres: meta.genres, creators: [], characters: [], keeper: true,
  };
});
