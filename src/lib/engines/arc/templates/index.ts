// Every journey ComicPill can build, keyed by template key.
import type { ArcTemplate } from '../types';
import { BATMAN_FAMILY_ARC } from './batmanFamily';
import { NIGHTWING_ARC } from './nightwing';
import { SUPERMAN_ARC } from './supermanLegacy';

export const ARC_TEMPLATES: Record<string, ArcTemplate> = {
  [BATMAN_FAMILY_ARC.key]: BATMAN_FAMILY_ARC,
  [SUPERMAN_ARC.key]: SUPERMAN_ARC,
  [NIGHTWING_ARC.key]: NIGHTWING_ARC,
};

export { BATMAN_FAMILY_ARC, NIGHTWING_ARC, SUPERMAN_ARC };
