// Which fetched cloud comics to drop to stay under the cache limit.
/** Which cached books to drop so the rest fit in the limit, oldest-read first. Never drops `keepId`. Pure, so it is testable. */
export function pickEvictions(entries: Array<{ id: string; bytes: number; lastReadAt: number }>, limit: number, keepId: string): string[] {
  let total = entries.reduce((n, e) => n + e.bytes, 0);
  const drop: string[] = [];
  for (const e of [...entries].filter((x) => x.id !== keepId).sort((a, b) => a.lastReadAt - b.lastReadAt)) {
    if (total <= limit) break;
    drop.push(e.id); total -= e.bytes;
  }
  return drop;
}

