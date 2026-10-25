// BATMAN: FROM YEAR ONE TO LEGACY — a CHARACTER LIFE ARC + FAMILY ARC +
// LEGACY ARC. Curated by hand on purpose: which books actually connect is
// graph data, never something a language model gets to invent per request
// (the LLM only picks THIS template and explains it afterwards).
//
// Conventions
//  - `why` lines are spoiler-safe: they say what a book is FOR, not what
//    happens in it.
//  - continuity: 'main' is the canonical path; 'flashback' is an early-career
//    story told after the fact; 'retelling' re-tells an origin in a newer
//    continuity. Alternate futures and Elseworlds live ONLY in the endgame
//    branches, labelled, and never chain onto the main timeline.
//  - A book appears once on the main path; endgame branch books are separate.
import type { ArcItemDef, ArcTemplate, ArcTier, Continuity } from '../types';

const it = (
  workId: string, tier: ArcTier, why: string, continuity: Continuity = 'main', skip?: ArcItemDef['skip'],
): ArcItemDef => ({ workId, tier, why, continuity, ...(skip ? { skip } : {}) });

export const BATMAN_FAMILY_ARC: ArcTemplate = {
  key: 'batman-year-one-to-legacy',
  title: 'Batman: From Year One to Legacy',
  goal: 'Watch Bruce become Batman, build the Bat-Family, meet each Robin, see Dick become Nightwing, follow Jason into Red Hood, meet Damian, and eventually explore where Batman’s story can end.',
  kinds: ['character_life_arc', 'family_arc', 'legacy_arc'],
  character: 'Batman',
  aliases: ['Bat-Family', 'Batman and Son', 'Batman and Sons', 'Bruce Wayne', 'Year One', 'The Robins', 'Batgirl', 'Oracle', 'Bat Family'],
  branches: [{
    milestoneId: 'ms-dick-becomes-nightwing',
    templateKey: 'nightwing-dick-grayson',
    label: 'Follow Nightwing',
    pitch: 'A short journey through Dick Grayson\u2019s own story, then back to Batman.',
  }],
  family: {
    root: 'Bruce Wayne',
    branches: [
      { name: 'Dick Grayson', identities: [
        { label: 'Robin', milestoneId: 'ms-dick-becomes-robin' },
        { label: 'Nightwing', milestoneId: 'ms-dick-becomes-nightwing' },
        { label: 'Batman', milestoneId: 'ms-dick-becomes-batman' },
      ] },
      { name: 'Jason Todd', identities: [
        { label: 'Robin', milestoneId: 'ms-jason-becomes-robin' },
        { label: 'Red Hood', milestoneId: 'ms-jason-red-hood' },
      ] },
      { name: 'Tim Drake', identities: [
        { label: 'Robin', milestoneId: 'ms-tim-becomes-robin' },
        { label: 'Red Robin', milestoneId: 'ms-tim-red-robin' },
      ] },
      { name: 'Damian Wayne', identities: [
        { label: 'Robin', milestoneId: 'ms-damian-enters' },
      ] },
    ],
  },
  chapters: [
    {
      id: 'ch-the-batman',
      title: 'The Beginning',
      tagline: 'Bruce becomes Batman.',
      milestones: [
        {
          id: 'ms-bruce-becomes-batman', title: 'Bruce becomes Batman', character: 'Bruce Wayne',
          change: 'A grieving billionaire commits to a war on Gotham’s crime.',
          items: [
            it('year-one', 'essential', 'The definitive first year: how Bruce learns to be Batman, and who he can trust.'),
            it('man-who-laughs', 'essential', 'Early Batman meets the first real chaos in Gotham.', 'flashback'),
            it('dc-800-batman-year-two', 'optional', 'A follow-up to Year One that tests Batman’s methods.', 'flashback'),
            it('dc-800-batman-the-knight', 'deep_cut', 'Fills in Bruce’s training years before Gotham.', 'flashback'),
          ],
        },
        {
          id: 'ms-batman-learns-gotham', title: 'Batman learns Gotham', character: 'Bruce Wayne',
          change: 'The war on crime turns into a mystery that costs him.',
          items: [
            it('long-halloween', 'essential', 'A year-long murder mystery that defines Gotham’s underworld and the early Batman.'),
            it('batman-haunted-knight', 'optional', 'Short, atmospheric Halloween stories from the same creative team.'),
            it('dc-800-batman-zero-year', 'optional', 'A newer retelling of the origin — different continuity, same territory as Year One.', 'retelling',
              { impact: 'You will still follow the whole journey.', missed: 'An alternate take on Bruce’s first years.', recommendation: 'Skip it unless you want a second version of the origin.' }),
          ],
        },
      ],
    },
    {
      id: 'ch-first-robin',
      title: 'The First Robin',
      tagline: 'Bruce stops being completely alone.',
      milestones: [
        {
          id: 'ms-dick-becomes-robin', title: 'Dick Grayson enters Bruce’s life', character: 'Dick Grayson',
          change: 'Batman gains a partner, and the mission gets a heart.',
          items: [
            it('dark-victory', 'essential', 'Continues The Long Halloween and introduces Dick Grayson into Bruce’s life — the shift from solo Batman toward the Bat-Family.'),
            it('robin-year-one', 'recommended', 'Shows Dick actually learning how to be Robin.', 'main', {
              impact: 'You will still understand the overall Batman story.',
              missed: 'More of Bruce and Dick’s early relationship.',
              recommendation: 'Read it if Dick/Nightwing becomes one of your favourite characters.',
            }),
          ],
        },
        {
          id: 'ms-dick-becomes-nightwing', title: 'Dick becomes Nightwing', character: 'Dick Grayson',
          change: 'Robin steps out of Batman’s shadow and into his own name.',
          items: [
            it('nightwing-year-one', 'recommended', 'Dick’s transition from Robin to his own hero.'),
            it('nightwing-leaping-light', 'optional', 'A modern starting point for Dick’s solo career.'),
          ],
        },
      ],
    },
    {
      id: 'ch-second-robin',
      title: 'The Second Robin',
      tagline: 'A new Robin, and the story that changes the family.',
      milestones: [
        {
          id: 'ms-jason-becomes-robin', title: 'Jason Todd becomes Robin', character: 'Jason Todd',
          change: 'A very different kid takes the costume.',
          items: [
            it('arc-batman-second-chances', 'recommended', 'How Jason Todd ends up as Robin.'),
          ],
        },
        {
          id: 'ms-jason-turning-point', title: 'Jason’s turning point', character: 'Jason Todd',
          change: 'A defining event that reshapes Bruce and the family.',
          items: [
            it('death-in-family', 'essential', 'One of the most influential Batman stories ever printed — what follows in the family is built on it.'),
          ],
        },
        {
          id: 'ms-jason-red-hood', title: 'Jason becomes Red Hood', character: 'Jason Todd',
          change: 'A former Robin returns on very different terms.',
          items: [
            it('under-red-hood', 'essential', 'The payoff to Jason’s story and the origin of the Red Hood identity.'),
            it('arc-red-hood-lost-days', 'deep_cut', 'Fills the gap in Jason’s path between the two.'),
          ],
        },
      ],
    },
    {
      id: 'ch-tim-drake',
      title: 'A New Robin',
      tagline: 'Tim Drake finds the family.',
      milestones: [
        {
          id: 'ms-tim-becomes-robin', title: 'Tim Drake becomes Robin', character: 'Tim Drake',
          change: 'The third Robin arrives by working out who Batman is.',
          items: [
            it('arc-batman-lonely-place-of-dying', 'essential', 'How Tim Drake becomes Robin and why Batman needs one.'),
          ],
        },
        {
          id: 'ms-tim-red-robin', title: 'Tim becomes Red Robin', character: 'Tim Drake',
          change: 'Another Robin claims his own name.',
          items: [
            it('arc-red-robin-the-grail', 'optional', 'Tim on his own, stepping out of the Robin identity.'),
          ],
        },
      ],
    },
    {
      id: 'ch-damian',
      title: 'Batman and Son',
      tagline: 'Damian Wayne enters Bruce’s life.',
      milestones: [
        {
          id: 'ms-damian-enters', title: 'Damian enters', character: 'Damian Wayne',
          change: 'Bruce learns he has a son.',
          items: [
            it('arc-batman-and-son', 'essential', 'Introduces Damian Wayne and the start of the Batman-and-son story.'),
          ],
        },
        {
          id: 'ms-batman-turning-point', title: 'A turning point for Batman', character: 'Bruce Wayne',
          change: 'The mantle stops being certain.',
          items: [
            it('arc-batman-rip', 'essential', 'A major turning point for Bruce and the reason the cowl changes hands.'),
            it('dc-800-batman-battle-for-the-cowl', 'essential', 'The scramble to decide who carries on as Batman.'),
          ],
        },
        {
          id: 'ms-dick-becomes-batman', title: 'A new Dynamic Duo', character: 'Dick Grayson',
          change: 'Dick takes up the Batman role, with Damian at his side.',
          items: [
            it('batman-robin-reborn', 'essential', 'Dick and Damian as Batman and Robin — the payoff of everything Dick has become.'),
            it('arc-batman-robin-vs-robin', 'optional', 'More of the new partnership.'),
            it('dc-800-batman-the-return-of-bruce-wayne', 'recommended', 'Bruce’s story continues while the family carries on.'),
            it('dc-800-batman-incorporated-vol-1', 'recommended', 'Bruce’s global Batman project and a wider family of heroes.'),
          ],
        },
      ],
    },
    {
      id: 'ch-legacy',
      title: 'The Family',
      tagline: 'The Bat-Family stands together.',
      milestones: [
        {
          id: 'ms-bat-family', title: 'The Bat-Family', character: 'Bat-Family',
          change: 'Everything Bruce built is put under pressure at once.',
          items: [
            it('hush', 'recommended', 'A big mystery that pulls in most of Bruce’s world.'),
            it('killing-joke', 'recommended', 'A short, influential Joker story that shaped Barbara Gordon’s path.'),
            it('batgirl-year-one', 'optional', 'Barbara Gordon’s own origin.'),
            it('death-of-family', 'recommended', 'The Joker tests every member of the family.'),
            it('black-mirror', 'recommended', 'Dick as Batman, in a grim Gotham story.'),
            it('dc-800-batman-heart-of-hush', 'deep_cut', 'A follow-up to Hush for readers who loved it.'),
            it('dc-800-batman-the-black-casebook', 'deep_cut', 'Collected side stories from across the era.'),
          ],
        },
        {
          id: 'ms-modern-batman', title: 'Modern Batman', character: 'Bruce Wayne',
          change: 'Gotham’s secret history and the modern era of Batman.',
          items: [
            it('batman-court-of-owls', 'recommended', 'The start of the modern Batman run: an old secret in Gotham.'),
            it('dc-800-batman-city-of-owls', 'optional', 'Continues the Court of Owls story.'),
            it('dc-800-batman-knightfall-vol-1', 'deep_cut', 'A classic 90s event that tested Bruce to his limits.'),
            it('dc-800-batman-prodigal', 'deep_cut', 'The Knightfall-era aftermath from the family’s perspective.'),
          ],
        },
      ],
    },
  ],
  endgame: {
    id: 'eg-endgame',
    title: 'Endgame',
    tagline: 'Where do you want Bruce’s story to go?',
    question: 'Where do you want Bruce’s story to end?',
    branches: [
      {
        id: 'eg-main', label: 'Main continuity', description: 'Keep going with modern Batman.',
        continuityNote: 'Main continuity — these follow on from the modern run.',
        items: [
          it('dc-800-batman-endgame', 'recommended', 'A large-scale Joker story from the modern run.'),
          it('dc-800-batman-superheavy', 'optional', 'What happens to the mantle afterwards.'),
          it('dc-800-batman-i-am-gotham', 'optional', 'A fresh start for Batman in Gotham.'),
          it('dc-800-batman-the-joker-war', 'optional', 'A major later-run Joker story.'),
          it('dc-800-batman-fear-state', 'deep_cut', 'A later event that pulls in the wider family.'),
        ],
      },
      {
        id: 'eg-legacy', label: 'Legacy', description: 'Stories about what Batman leaves behind.',
        continuityNote: 'These are set in the future of a different timeline, not the main one.',
        items: [
          it('dc-800-batman-beyond-the-white-knight', 'recommended', 'A future Gotham and a new person under the cowl.', 'possible_future'),
        ],
      },
      {
        id: 'eg-future', label: 'A possible ending', description: 'An older Bruce, in a future that may never happen.',
        continuityNote: 'A separate continuity — do not read it as the next chapter of the main journey.',
        items: [
          it('dark-knight-returns', 'recommended', 'A classic vision of an older, angrier Batman.', 'possible_future'),
          it('dc-800-batman-the-dark-knight-strikes-again', 'deep_cut', 'The sequel to that vision.', 'possible_future'),
          it('kingdom-come', 'optional', 'An older generation of heroes facing a new one.', 'elseworld'),
        ],
      },
      {
        id: 'eg-alternate', label: 'Alternate takes', description: 'Different interpretations of Batman entirely.',
        continuityNote: 'Alternate universes — each stands on its own.',
        items: [
          it('white-knight', 'recommended', 'A different Gotham where the roles are turned around.', 'alternate'),
          it('dc-800-batman-curse-of-the-white-knight', 'optional', 'Continues that alternate take.', 'alternate'),
          it('abs-batman-1', 'optional', 'A newer alternate Batman.', 'alternate'),
          it('gotham-by-gaslight', 'optional', 'Batman in the Victorian era.', 'elseworld'),
        ],
      },
    ],
  },
};
