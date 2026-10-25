// NIGHTWING: DICK GRAYSON ON HIS OWN — a short CHARACTER LIFE ARC, offered as
// a branch from the Batman journey's "Dick becomes Nightwing" milestone. It is
// deliberately small: three beats, the essentials of stepping out of Robin's
// shadow. `why` lines describe what a book is for, never what happens in it.
import type { ArcTemplate } from '../types';
import { item as it } from './util';

export const NIGHTWING_ARC: ArcTemplate = {
  key: 'nightwing-dick-grayson',
  title: 'Nightwing: Dick Grayson on His Own',
  goal: 'Follow Dick Grayson from Robin, to his own hero, to the times he carries the weight of Batman.',
  kinds: ['character_life_arc', 'transformation_arc'],
  character: 'Nightwing',
  aliases: ['Dick Grayson', 'Robin', 'Batman Family'],
  chapters: [
    {
      id: 'nw-ch-robin', title: 'Robin', tagline: 'Where Dick starts.',
      milestones: [{
        id: 'nw-ms-robin', title: 'Dick learns to be Robin', character: 'Dick Grayson',
        change: 'A young acrobat becomes Batman’s partner.',
        items: [it('robin-year-one', 'essential', 'Shows Dick actually learning how to be Robin.')],
      }],
    },
    {
      id: 'nw-ch-nightwing', title: 'Nightwing', tagline: 'Stepping out of the shadow.',
      milestones: [
        {
          id: 'nw-ms-nightwing', title: 'Dick becomes Nightwing', character: 'Dick Grayson',
          change: 'Robin takes his own name.',
          items: [
            it('nightwing-year-one', 'essential', 'Dick’s transition from Robin to his own hero.'),
            it('nightwing-leaping-light', 'essential', 'A modern starting point for Dick’s solo career.'),
          ],
        },
      ],
    },
    {
      id: 'nw-ch-mantle', title: 'The Mantle', tagline: 'When Dick carries the cowl.',
      milestones: [{
        id: 'nw-ms-mantle', title: 'Dick takes on the Batman role', character: 'Dick Grayson',
        change: 'The partner becomes the lead.',
        items: [
          it('black-mirror', 'recommended', 'Dick as Batman, in a grim Gotham story.'),
          it('batman-robin-reborn', 'recommended', 'Dick as Batman with a new Robin at his side.'),
        ],
      }],
    },
  ],
};
