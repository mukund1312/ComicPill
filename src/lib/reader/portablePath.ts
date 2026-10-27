// On iOS the app's sandbox folder gets a new random name after an update, a restore or a reinstall, so a saved absolute file address goes stale
// ("File not found") while the file is still there. Anything we saved under the app's own folders is re-pointed at today's folder.
const MARKERS = ['/Documents/', '/Library/Caches/', '/tmp/'];

/** The part of a saved address that stays true from one install to the next, with the marker kept ("/Documents/comics/…"). */
export function stableTail(saved: string): { marker: string; tail: string } | null {
  const clean = saved.replace(/^file:\/\//, '');
  for (const m of MARKERS) {
    const i = clean.indexOf(m);
    if (i >= 0) return { marker: m, tail: clean.slice(i + m.length) };
  }
  return null;
}

/** Today's address for a saved one: same folder kind and tail, under the current folder of that kind. `roots` maps a marker to today's folder (with trailing slash). */
export function rebase(saved: string, roots: Record<string, string>): string {
  const t = stableTail(saved);
  if (!t) return saved;
  const root = roots[t.marker];
  return root ? `${root}${t.tail}` : saved;
}
