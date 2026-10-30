// Hand-made reading orders. Each entry is a collected edition or series, with whether the story needs it (essential) or it is for context
// and extra story (optional). The order is the order to read. A starting set: add more in this shape, and fix any entry that is off.
import type { OrderEntry, ReadingOrder } from './types';

const e = (title: string, role: OrderEntry['role'], match: string[], extra: Partial<OrderEntry> = {}): OrderEntry => ({ title, role, match, ...extra });
const vols = (title: string, role: OrderEntry['role'], phrase: string, n: number, note?: string): OrderEntry[] =>
  Array.from({ length: n }, (_, i) => e(`${title} Vol. ${i + 1}`, role, [`${phrase} v${i + 1}`], { note }));

export const READING_ORDERS: ReadingOrder[] = [
  {
    id: 'secret-wars-2015', title: 'Secret Wars (2015)', publisher: 'Marvel', year: '2012–2016',
    blurb: 'Jonathan Hickman’s Avengers saga: incursions end the multiverse, and Doom rebuilds it as Battleworld.',
    aliases: ['secret wars', 'secret wars 2015', 'hickman avengers', 'battleworld', 'time runs out', 'infinity', 'incursions', 'illuminati'],
    entries: [
      ...vols('Fantastic Four by Jonathan Hickman', 'optional', 'fantastic four jonathan hickman', 4, 'Sets up Doom, Reed and the Richards family'),
      e('Avengers by Jonathan Hickman Vol. 1', 'essential', ['avengers jonathan hickman v1'], { not: ['new'], note: 'Read the Avengers and New Avengers runs side by side' }),
      e('New Avengers by Jonathan Hickman Vol. 1', 'essential', ['new avengers jonathan hickman v1'], { note: 'The Illuminati and the first incursions' }),
      e('Avengers by Jonathan Hickman Vol. 2', 'essential', ['avengers jonathan hickman v2'], { not: ['new'] }),
      e('New Avengers by Jonathan Hickman Vol. 2', 'essential', ['new avengers jonathan hickman v2']),
      e('Infinity', 'essential', ['infinity'], { not: ['gauntlet', 'war', 'wars', 'crusade', 'countdown', 'watch', 'abyss', 'inc', 'reach', 'saga'], note: 'Thanos attacks; the story that leads into Time Runs Out' }),
      e('Avengers by Jonathan Hickman Vol. 3', 'essential', ['avengers jonathan hickman v3'], { not: ['new'] }),
      e('New Avengers by Jonathan Hickman Vol. 3', 'essential', ['new avengers jonathan hickman v3']),
      ...vols('Avengers: Time Runs Out', 'essential', 'time runs out', 4, 'The final run to the end of the multiverse'),
      e('Secret Wars (2015)', 'essential', ['secret wars'], { not: ['journal', 'battleworld', 'too', '2099'], note: 'The main series' }),
      e('Thors', 'optional', ['thors'], { note: 'Battleworld tie-in: a police procedural with Thors' }),
      e('Siege', 'optional', ['siege'], { not: ['perilous', 'marvel', 'storm'], note: 'Battleworld tie-in: the wall at the edge' }),
      e('A-Force', 'optional', ['a force'], { note: 'Battleworld tie-in' }),
      e('Ultimate End', 'optional', ['ultimate end'], { note: 'Ends the Ultimate universe' }),
      e('All-New, All-Different Avengers', 'optional', ['all new all different avengers'], { note: 'What comes after' }),
    ],
  },
  {
    id: 'civil-war-2006', title: 'Civil War (2006)', publisher: 'Marvel', year: '2006–2007',
    blurb: 'The Superhuman Registration Act splits the heroes: Iron Man’s side against Captain America’s.',
    aliases: ['civil war', 'civil war marvel', 'road to civil war', 'registration act', 'iron man vs captain america', 'fallen son'],
    entries: [
      e('The Road to Civil War', 'essential', ['road to civil war'], { note: 'The build-up' }),
      e('Civil War', 'essential', [], { exact: ['civil war'], note: 'The main series' }),
      e('Civil War: Front Line', 'optional', ['civil war front line', 'civil war frontline'], { note: 'The story told through reporters' }),
      e('Amazing Spider-Man: Civil War', 'optional', ['amazing spider man civil war', 'civil war amazing spider man'], { note: 'Peter unmasks' }),
      e('Civil War: Iron Man', 'optional', ['civil war iron man']),
      e('Civil War: Captain America', 'optional', ['civil war captain america']),
      e('Civil War: Wolverine', 'optional', ['civil war wolverine']),
      e('Civil War: X-Men', 'optional', ['civil war x men', 'civil war xmen']),
      e('Civil War: Young Avengers & Runaways', 'optional', ['civil war young avengers runaways']),
      e('Civil War: War Crimes', 'optional', ['civil war war crimes']),
      e('Civil War: The Initiative', 'optional', ['civil war initiative']),
      e('Fallen Son: The Death of Captain America', 'essential', ['fallen son'], { note: 'The aftermath' }),
    ],
  },
  {
    id: 'world-war-hulk', title: 'World War Hulk', publisher: 'Marvel', year: '2006–2008',
    blurb: 'Banished to another world, the Hulk comes back for the heroes who sent him away.',
    aliases: ['world war hulk', 'planet hulk', 'hulk', 'wwh', 'illuminati'],
    entries: [
      e('Planet Hulk Prelude', 'optional', ['planet hulk prelude'], { note: 'How the Hulk gets sent away' }),
      e('Planet Hulk', 'essential', ['planet hulk'], { not: ['prelude', 'world'], note: 'What happens to the Hulk on Sakaar' }),
      e('World War Hulk: Prologue: World Breaker', 'essential', ['world breaker']),
      e('World War Hulk', 'essential', ['world war hulk'], { not: ['front', 'line', 'frontline', 'prologue', 'breaker', 'aftersmash', 'damage', 'control', 'hire', 'gamma', 'warbound'], note: 'The main series' }),
      e('World War Hulk: Front Line', 'optional', ['world war hulk front line', 'world war hulk frontline'], { note: 'Through the reporters’ eyes' }),
      e('World War Hulk: X-Men', 'optional', ['world war hulk x men', 'world war hulk xmen']),
      e('World War Hulk: Heroes for Hire', 'optional', ['world war hulk heroes hire']),
      e('World War Hulk: Gamma Corps', 'optional', ['world war hulk gamma corps']),
      e('World War Hulk: Warbound', 'optional', ['world war hulk warbound']),
      e('World War Hulk: Aftersmash: Damage Control', 'optional', ['aftersmash damage control', 'world war hulk aftersmash'], { note: 'The aftermath' }),
    ],
  },
  {
    id: 'flashpoint', title: 'Flashpoint', publisher: 'DC', year: '2009–2011',
    blurb: 'Barry Allen wakes in a world where nothing is as it was; fixing it creates the New 52.',
    aliases: ['flashpoint', 'flashpoint paradox', 'new 52', 'barry allen', 'the flash', 'thomas wayne batman'],
    entries: [
      e('The Flash: Rebirth', 'optional', ['flash rebirth'], { note: 'Barry Allen returns' }),
      e('Final Crisis', 'optional', ['final crisis'], { not: ['legion', 'revelations', 'requiem', 'resist', 'submit'], note: 'Where Barry first comes back' }),
      e('Flashpoint', 'essential', [], { exact: ['flashpoint'], note: 'The main series' }),
      e('Flashpoint: Batman: Knight of Vengeance', 'optional', ['flashpoint batman knight vengeance'], { note: 'Thomas Wayne as Batman' }),
      e('Flashpoint: Wonder Woman and the Furies', 'optional', ['flashpoint wonder woman']),
      e('Flashpoint: Emperor Aquaman', 'optional', ['flashpoint emperor aquaman', 'flashpoint aquaman']),
      e('Flashpoint: Lois Lane and the Resistance', 'optional', ['flashpoint lois lane']),
      e('Flashpoint: Project Superman', 'optional', ['flashpoint project superman']),
      e('Flashpoint: Deadman and the Flying Graysons', 'optional', ['flashpoint deadman']),
      e('Flashpoint: Deathstroke and the Curse of the Ravager', 'optional', ['flashpoint deathstroke']),
      e('Flashpoint: Citizen Cold', 'optional', ['flashpoint citizen cold']),
      e('Flashpoint: Kid Flash Lost', 'optional', ['flashpoint kid flash']),
      e('Justice League Vol. 1: Origin', 'optional', ['justice league v1 origin', 'justice league origin'], { note: 'Where the New 52 begins' }),
    ],
  },
  {
    id: 'dc-crisis-to-flashpoint', title: 'DC’s big events: Crisis to Flashpoint', publisher: 'DC', year: '1985–2011',
    blurb: 'The DC Universe’s major crossover events in order, from Crisis on Infinite Earths to Flashpoint.',
    aliases: ['crisis', 'dc events', 'dc crossovers', 'crisis on infinite earths', 'identity crisis', 'infinite crisis', 'final crisis', 'blackest night', 'sinestro corps war', 'green lantern', '52', 'dc universe'],
    entries: [
      e('Crisis on Infinite Earths', 'essential', ['crisis on infinite earths'], { note: 'Multiverse into one universe' }),
      e('Identity Crisis', 'optional', ['identity crisis'], { note: 'Murder mystery that reshapes the Justice League' }),
      e('Infinite Crisis', 'essential', ['infinite crisis'], { not: ['earths', 'identity', 'final', 'blackest'] }),
      e('52', 'essential', ['52 v1', '52 v2', '52 v3', '52 v4'], { exact: ['52'], note: 'A year of the DC Universe in real time' }),
      e('Green Lantern: Rebirth', 'essential', ['green lantern rebirth'], { note: 'Hal Jordan returns' }),
      e('Sinestro Corps War', 'essential', ['sinestro corps war']),
      e('Blackest Night', 'essential', ['blackest night']),
      e('Final Crisis', 'essential', ['final crisis'], { not: ['legion', 'revelations', 'requiem', 'resist', 'submit'] }),
      e('Flashpoint', 'essential', [], { exact: ['flashpoint'] }),
    ],
  },
];
