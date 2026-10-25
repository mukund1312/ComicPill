// Side journeys: starting one must never duplicate an existing branch or
// disturb the parent journey.
export interface BranchLike { id: string; parentArcId: string | null; templateKey: string; status: 'active' | 'saved' | 'done' }

/** The branch of `parentId` into `templateKey` that is already in progress, if any. */
export function findExistingBranch<T extends BranchLike>(arcs: readonly T[], parentId: string, templateKey: string): T | null {
  return arcs.find((a) => a.parentArcId === parentId && a.templateKey === templateKey && a.status !== 'done') ?? null;
}
