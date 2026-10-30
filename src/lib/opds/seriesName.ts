// Working out which series a comic belongs to from its file name ("Ice Cream Man v03 - Hopscotch Mélange (2019) (Digital) (Group).cbz"), so a
// server library kept as one flat folder still comes across in tidy series folders. Nothing is renamed; this only decides where a comic is filed.

/** The series part of a file name: no extension, release tags, volume or issue number. */
export function seriesOf(fileName: string): string {
  let s = fileName.replace(/\.(cbz|cbr|cb7|zip|rar|7z|pdf|epub)$/i, '');
  s = s.replace(/\s*GetComics\.INFO.*$/i, '');
  s = s.split(/\s+\(/)[0];                                              // "(2018) (Digital) (Group)" onward
  s = s.replace(/\s+(?:v|vol\.?|volume|book)\s*\d+.*$/i, '');          // " v01 - Title", " Book 02"
  s = s.replace(/,\s*volume\s*\d+.*$/i, '');
  s = s.replace(/\s+\d{1,4}$/, '');                                     // a trailing issue number
  s = s.replace(/^the\s+/i, '');
  return s.replace(/^[\s,-]+|[\s,-]+$/g, '') || fileName;
}

/**
 * The folder for each file name. A name that only continues another series' name ("Animal Man by Grant Morrison 30th Anniversary…",
 * "Ultimate Wolverine - The Winter Soldier") joins that series; names that differ only in capitals share one spelling.
 */
export function groupSeries(fileNames: string[]): Map<string, string> {
  const own = new Map(fileNames.map((n) => [n, seriesOf(n)]));
  const names = [...new Set(own.values())];
  const lower = new Map<string, string>();
  for (const n of [...names].sort()) if (!lower.has(n.toLowerCase())) lower.set(n.toLowerCase(), n);
  const canon = (n: string) => lower.get(n.toLowerCase()) ?? n;
  const target = new Map<string, string>(names.map((n) => [n, canon(n)]));
  const pool = [...new Set([...target.values()])].sort((a, b) => a.length - b.length);
  for (const name of pool) {
    for (const other of pool) {
      if (other === name || other.length >= name.length) continue;
      const rest = name.toLowerCase().startsWith(other.toLowerCase()) ? name.slice(other.length) : null;
      if (rest !== null && (/^\s/.test(rest))) { for (const [k, v] of target) if (v === name) target.set(k, other); break; }
    }
  }
  return new Map(fileNames.map((n) => [n, target.get(own.get(n) as string) as string]));
}

/** A server series that is really a catch-all (many different series in one folder) is worth regrouping; a real series is left alone. */
export const looksFlat = (groups: Map<string, string>): boolean => new Set(groups.values()).size >= 3;
