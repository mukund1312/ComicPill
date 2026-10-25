import type { ArcItemDef, ArcTier, Continuity } from '../types';

/** Compact constructor for a template's book entries. */
export const item = (
  workId: string, tier: ArcTier, why: string, continuity: Continuity = 'main', skip?: ArcItemDef['skip'],
): ArcItemDef => ({ workId, tier, why, continuity, ...(skip ? { skip } : {}) });
