// Pure folder-tree logic (nesting, moves, locks), so it can be unit-tested without a database.
export type FolderNode = { id: string; parentId: string | null };

/** The folder itself and everything nested below it, at any depth. */
export function subtreeIds(folders: FolderNode[], rootId: string): Set<string> {
  const out = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) if (f.parentId && out.has(f.parentId) && !out.has(f.id)) { out.add(f.id); grew = true; }
  }
  return out;
}

/** Can these folders move into `targetId` (null = the top)? Not into themselves or anything inside themselves. */
export function canMoveFolders(folders: FolderNode[], movingIds: string[], targetId: string | null): boolean {
  if (targetId === null) return true;
  return movingIds.every((id) => !subtreeIds(folders, id).has(targetId));
}

/** From the top down to `id`, e.g. [Marvel, X-Men, 90s]. Stops if the data ever loops. */
export function pathTo(folders: FolderNode[], id: string | null): string[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: string[] = [];
  const seen = new Set<string>();
  for (let cur = id; cur && !seen.has(cur) && byId.has(cur); cur = byId.get(cur)!.parentId) { seen.add(cur); path.unshift(cur); }
  return path;
}

/** Folders that are locked and not opened yet, plus everything inside them: their comics stay out of searches. */
export function shutFolders(folders: FolderNode[], locked: Set<string>, opened: Set<string>): Set<string> {
  const shut = new Set<string>();
  for (const f of folders) {
    if (locked.has(f.id) && !opened.has(f.id)) for (const id of subtreeIds(folders, f.id)) shut.add(id);
  }
  return shut;
}
