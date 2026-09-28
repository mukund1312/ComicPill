import { useMemo, useState } from 'react';
import { db } from '../../lib/db/client';
import { pathItems, paths } from '../../lib/db/schema';
import { loadAllEdges, loadAllWorkContexts } from '../../lib/db/queries/library';
import { expandPath, nextInPath } from '../../lib/engines/graph/path';
import type { ContextLevel } from '../../lib/types/domain';

export function usePaths() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [level, setLevel] = useState<ContextLevel>('recommended');
  const data = useMemo(() => {
    const records = db.select().from(paths).all(); const rows = db.select().from(pathItems).all(); const contexts = loadAllWorkContexts();
    const titleById = new Map(contexts.map((ctx) => [ctx.work.id, ctx.work.title]));
    const statusById = new Map(contexts.map((ctx) => [ctx.work.id, (ctx.library?.status ?? 'none') as 'none' | 'reading' | 'done' | 'dropped']));
    return records.map((path) => {
      const seed = rows.filter((row) => row.pathId === path.id).sort((a, b) => a.position - b.position).map((row) => row.workId);
      const items = expandPath(seed, loadAllEdges(), level).map((item) => ({ ...item, title: titleById.get(item.workId) ?? item.workId, status: statusById.get(item.workId) ?? 'none' }));
      const done = items.filter((item) => item.status === 'done').length;
      return { id: path.id, name: path.name, key: path.pathKey, items, done, nextId: nextInPath(items, { status: statusById }) };
    });
  }, [level]);
  const selected = data.find((path) => path.id === selectedId) ?? null;
  return { paths: data, selected, select: setSelectedId, level, setLevel };
}
