// Batman-family works the arc builder needs that the popular/expansion
// catalog didn't already carry (the milestone chain can't skip Damian's
// introduction or Tim's, however popular the rest of the shelf is). Global
// catalog facts only — no ownership or reading state.
import type { Dim, Universe } from '../../types/domain';

export interface BatmanArcRow {
  id: string;
  title: string;
  lane: 'dc-popular';
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

const row = (
  id: string, title: string, order: number, note: string,
  characters: string[], creators: string[], genres: string[], fp: Record<Dim, number>,
): BatmanArcRow => ({
  id, title, lane: 'dc-popular', laneName: 'Popular DC picks', universe: 'main', order,
  own: 'none', status: 'none', format: 'physical',
  formatWhy: 'A physical edition suits this collection-worthy read.',
  note, flag: null, fp, genres, creators, characters, keeper: true,
});

export const BATMAN_ARC_ROWS: BatmanArcRow[] = [
  row('arc-worlds-finest-vol-1', 'Batman/Superman: World\u2019s Finest Vol. 1', 2990,
    'Batman and Superman together, with a wide cast of established DC heroes.',
    ['Batman', 'Superman', 'Robin'], ['Mark Waid', 'Dan Mora'], ['heroic', 'sci-fi'],
    { tone: .3, violence: .35, scale: .6, complexity: .4, mystery: .25, pace: .8, artForward: .85, commitment: .35 }),
  row('arc-batman-second-chances', 'Batman: Second Chances', 3000,
    'How Jason Todd ends up in the Robin costume.',
    ['Batman', 'Jason Todd', 'Robin'], [], ['crime', 'heroic', 'drama'],
    { tone: .5, violence: .4, scale: .2, complexity: .35, mystery: .3, pace: .6, artForward: .55, commitment: .3 }),
  row('arc-batman-lonely-place-of-dying', 'Batman: A Lonely Place of Dying', 3010,
    'Tim Drake finds his way to Batman and the Robin mantle.',
    ['Batman', 'Tim Drake', 'Robin', 'Nightwing'], ['Marv Wolfman', 'George Perez'], ['crime', 'heroic', 'drama'],
    { tone: .5, violence: .35, scale: .25, complexity: .4, mystery: .4, pace: .6, artForward: .65, commitment: .3 }),
  row('arc-batman-and-son', 'Batman and Son', 3020,
    'Bruce meets his son, Damian.',
    ['Batman', 'Damian Wayne', 'Robin'], ['Grant Morrison', 'Andy Kubert'], ['crime', 'heroic', 'drama'],
    { tone: .55, violence: .5, scale: .35, complexity: .55, mystery: .5, pace: .6, artForward: .7, commitment: .3 }),
  row('arc-batman-rip', 'Batman R.I.P.', 3030,
    'A major turning point for Bruce, and the road to a new Batman.',
    ['Batman', 'Robin', 'Nightwing', 'Damian Wayne'], ['Grant Morrison', 'Tony Daniel'], ['mystery', 'crime', 'supernatural'],
    { tone: .8, violence: .55, scale: .4, complexity: .8, mystery: .8, pace: .5, artForward: .65, commitment: .4 }),
  row('arc-batman-robin-vs-robin', 'Batman and Robin Vol. 2: Batman vs. Robin', 3040,
    'Dick as Batman and Damian as Robin, with the family dynamic front and centre.',
    ['Batman', 'Robin', 'Damian Wayne', 'Nightwing'], ['Grant Morrison'], ['heroic', 'crime', 'drama'],
    { tone: .5, violence: .45, scale: .35, complexity: .6, mystery: .45, pace: .65, artForward: .7, commitment: .3 }),
  row('arc-red-robin-the-grail', 'Red Robin: The Grail', 3050,
    'Tim Drake steps out on his own as Red Robin.',
    ['Red Robin', 'Tim Drake'], [], ['heroic', 'mystery', 'drama'],
    { tone: .5, violence: .4, scale: .35, complexity: .5, mystery: .55, pace: .6, artForward: .6, commitment: .3 }),
  row('arc-red-hood-lost-days', 'Red Hood: Lost Days', 3060,
    'What Jason Todd did between his return and his reinvention.',
    ['Red Hood', 'Jason Todd'], [], ['crime', 'drama', 'heroic'],
    { tone: .7, violence: .65, scale: .25, complexity: .45, mystery: .4, pace: .6, artForward: .6, commitment: .3 }),
];
