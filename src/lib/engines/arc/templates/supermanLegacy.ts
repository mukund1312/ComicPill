// SUPERMAN: FROM KRYPTON TO LEGACY — a CHARACTER LIFE ARC + LEGACY ARC,
// running from the origin to the question of where Clark's story can end.
// Conventions match batmanFamily.ts: `why` lines say what a book is FOR and
// never what happens in it; futures, Elseworlds and alternates appear ONLY in
// the endgame branches, labelled, never chained onto the main timeline.
import type { ArcTemplate } from '../types';
import { item as it } from './util';

export const SUPERMAN_ARC: ArcTemplate = {
  key: 'superman-krypton-to-legacy',
  title: 'Superman: From Krypton to Legacy',
  goal: 'Follow Clark Kent from the origin of Superman, through his defining stories and his family, to the question of how his story can end.',
  kinds: ['character_life_arc', 'legacy_arc', 'origin_path'],
  character: 'Superman',
  aliases: ['Clark Kent', 'Man of Steel', 'Kal-El', 'Krypton', 'Jon Kent', 'Death of Superman', 'Kingdom Come'],
  chapters: [
    {
      id: 'su-ch-origin', title: 'The Origin', tagline: 'Clark becomes Superman.',
      milestones: [{
        id: 'su-ms-origin', title: 'Clark becomes Superman', character: 'Clark Kent',
        change: 'A farm boy from Kansas takes on the cape.',
        items: [
          it('dc-800-superman-secret-origin', 'essential', 'A modern retelling of how Clark becomes Superman.', 'retelling'),
          it('birthright', 'recommended', 'Another modern retelling of the origin, with more of Clark’s early years.', 'retelling',
            { impact: 'You will still follow the whole journey.', missed: 'A second version of the origin.', recommendation: 'Skip it if one retelling is enough.' }),
          it('superman-for-all-seasons', 'recommended', 'Clark’s early years, told across one year.', 'flashback'),
        ],
      }],
    },
    {
      id: 'su-ch-steel', title: 'The Man of Steel', tagline: 'What Superman stands for.',
      milestones: [{
        id: 'su-ms-krypton', title: 'Superman meets Krypton’s past', character: 'Clark Kent',
        change: 'His two worlds collide.',
        items: [
          it('superman-brainiac', 'recommended', 'A villain tied to Krypton’s past.'),
          it('superman-peace-earth', 'optional', 'A short, heartfelt Superman story.'),
          it('superman-up-in-the-sky', 'optional', 'Superman on a long, personal quest.'),
        ],
      }],
    },
    {
      id: 'su-ch-death', title: 'Death and Return', tagline: 'The story that made headlines.',
      milestones: [{
        id: 'su-ms-death', title: 'The Death of Superman', character: 'Clark Kent',
        change: 'The world faces a Metropolis without Superman.',
        items: [
          it('dc-800-the-death-of-superman', 'essential', 'One of the most famous events in comics.'),
          it('dc-800-superman-funeral-for-a-friend', 'recommended', 'The aftermath, told from the people he leaves behind.'),
          it('dc-800-superman-reign-of-the-supermen', 'recommended', 'Several people step forward to claim the name.'),
          it('dc-800-the-return-of-superman', 'essential', 'How the story of Superman’s return plays out.'),
        ],
      }],
    },
    {
      id: 'su-ch-family', title: 'The Family', tagline: 'Clark as a husband and father.',
      milestones: [
        {
          id: 'su-ms-family', title: 'Clark builds a family', character: 'Clark Kent',
          change: 'Superman’s life grows beyond the cape.',
          items: [
            it('dc-800-superman-lois-and-clark', 'recommended', 'Clark, Lois and their son start a new life.'),
            it('dc-800-superman-reborn', 'recommended', 'A turning point that reshapes Clark’s life in the modern era.'),
            it('dc-800-superman-the-unity-saga-the-house-of-el', 'optional', 'A story about Clark’s Kryptonian family.'),
          ],
        },
        {
          id: 'su-ms-legacy', title: 'A new Superman', character: 'Jon Kent',
          change: 'The next generation takes up the name.',
          items: [it('dc-800-superman-son-of-kal-el-vol-1', 'essential', 'Jon Kent takes up the Superman name.')],
        },
      ],
    },
  ],
  endgame: {
    id: 'su-eg', title: 'Endgame', tagline: 'Where can Superman’s story end?',
    question: 'Where do you want Clark’s story to end?',
    branches: [
      {
        id: 'su-eg-future', label: 'A possible future', description: 'An older generation of heroes, in a future that may never happen.',
        continuityNote: 'A separate continuity — do not read it as the next chapter of the main journey.',
        items: [it('kingdom-come', 'recommended', 'An older generation of heroes faces a new one.', 'elseworld')],
      },
      {
        id: 'su-eg-farewell', label: 'Farewell stories', description: 'Stories about the end of Superman’s career.',
        continuityNote: 'Standalone tales outside the main timeline.',
        items: [
          it('all-star', 'recommended', 'A standalone tale of a Superman with limited time.', 'alternate'),
          it('whatever-happened-superman', 'recommended', 'A farewell story for the classic Superman.', 'alternate'),
        ],
      },
      {
        id: 'su-eg-alternate', label: 'Alternate takes', description: 'Different interpretations of Superman entirely.',
        continuityNote: 'Alternate universes — each stands on its own.',
        items: [
          it('red-son', 'recommended', 'What if Superman grew up somewhere else?', 'elseworld'),
          it('abs-superman', 'optional', 'A newer alternate Superman.', 'alternate'),
          it('superman-american-alien', 'optional', 'An alternate take on Clark’s early years.', 'alternate'),
          it('superman-secret-identity', 'optional', 'A grounded, alternate-world take on Superman.', 'alternate'),
        ],
      },
    ],
  },
};
