import type { ContextLevel, EdgeType } from '../../types/domain';

export const LEVEL_EDGES: Record<ContextLevel, EdgeType[]> = {
  simple: ['direct_sequel', 'required_context'],
  recommended: ['direct_sequel', 'required_context', 'same_run', 'same_event'],
  completionist: ['direct_sequel', 'required_context', 'same_run', 'same_event', 'optional_context'],
};
