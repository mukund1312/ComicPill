import { describe, expect, it } from 'vitest';
import { canMoveFolders, pathTo, shutFolders, subtreeIds, type FolderNode } from './folderTree';

const tree: FolderNode[] = [
  { id: 'a', parentId: null }, { id: 'b', parentId: 'a' }, { id: 'c', parentId: 'b' }, { id: 'd', parentId: null },
];

describe('folderTree', () => {
  it('finds everything nested below a folder', () => {
    expect([...subtreeIds(tree, 'a')].sort()).toEqual(['a', 'b', 'c']);
    expect([...subtreeIds(tree, 'd')]).toEqual(['d']);
  });
  it('lets folders move to the top or a sibling, but never inside themselves', () => {
    expect(canMoveFolders(tree, ['a'], null)).toBe(true);
    expect(canMoveFolders(tree, ['a'], 'd')).toBe(true);
    expect(canMoveFolders(tree, ['a'], 'c')).toBe(false);
    expect(canMoveFolders(tree, ['b'], 'b')).toBe(false);
    expect(canMoveFolders(tree, ['c'], 'a')).toBe(true);
  });
  it('gives the path from the top', () => {
    expect(pathTo(tree, 'c')).toEqual(['a', 'b', 'c']);
    expect(pathTo(tree, null)).toEqual([]);
    expect(pathTo([{ id: 'x', parentId: 'y' }, { id: 'y', parentId: 'x' }], 'x')).toEqual(['y', 'x']); // a loop in bad data can't hang it
  });
  it('shuts a locked folder and everything inside it until it is opened', () => {
    expect([...shutFolders(tree, new Set(['a']), new Set())].sort()).toEqual(['a', 'b', 'c']);
    expect(shutFolders(tree, new Set(['a']), new Set(['a'])).size).toBe(0);
  });
});
