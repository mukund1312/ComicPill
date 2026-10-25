import { describe, expect, it } from 'vitest';
import { findExistingBranch, type BranchLike } from './branches';

const arc = (over: Partial<BranchLike>): BranchLike => ({ id: 'x', parentArcId: null, templateKey: 't', status: 'active', ...over });

describe('findExistingBranch', () => {
  const arcs = [
    arc({ id: 'batman' }),
    arc({ id: 'nw-1', parentArcId: 'batman', templateKey: 'nightwing', status: 'active' }),
    arc({ id: 'nw-old', parentArcId: 'batman', templateKey: 'nightwing', status: 'done' }),
    arc({ id: 'other', parentArcId: 'superman', templateKey: 'nightwing' }),
  ];
  it('reopens the branch already in progress instead of duplicating it', () => {
    expect(findExistingBranch(arcs, 'batman', 'nightwing')?.id).toBe('nw-1');
  });
  it('a finished branch does not block starting a fresh one', () => {
    expect(findExistingBranch([arcs[2]], 'batman', 'nightwing')).toBeNull();
  });
  it('a saved (paused) branch is reopened too', () => {
    expect(findExistingBranch([arc({ id: 's', parentArcId: 'batman', templateKey: 'nightwing', status: 'saved' })], 'batman', 'nightwing')?.id).toBe('s');
  });
  it('only considers branches of THIS parent and THIS journey', () => {
    expect(findExistingBranch(arcs, 'superman', 'nightwing')?.id).toBe('other');
    expect(findExistingBranch(arcs, 'batman', 'superman-krypton-to-legacy')).toBeNull();
    expect(findExistingBranch(arcs, 'nobody', 'nightwing')).toBeNull();
  });
  it('an empty list yields nothing', () => {
    expect(findExistingBranch([], 'batman', 'nightwing')).toBeNull();
  });
});
