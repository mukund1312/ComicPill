// A comic file opened from another app ("Open with ComicPill") arrives as a content:// or file:// address.
// Send it to the screen that imports it, instead of letting the router treat it as a page that doesn't exist.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (/^(content|file):/i.test(path)) return `/reader/open?uri=${encodeURIComponent(path)}`;
  return path;
}
