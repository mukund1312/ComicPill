// Backs the playlist search bar: finding a specific comic to add, and
// detecting when what was typed is actually a character name so the UI can
// offer "build their journey" instead of (or alongside) plain title results.
import { loadAllWorkContexts } from './library';

export interface SearchWorkResult {
  workId: string;
  title: string;
  creators: string[];
  characters: string[];
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/** Title/creator/character substring search, most relevant first (a title
 *  match ranks above a creator/character-only match). Empty query returns
 *  nothing rather than the whole catalog. */
export function searchWorks(query: string, limit = 30): SearchWorkResult[] {
  const needle = normalize(query);
  if (!needle) return [];
  const contexts = loadAllWorkContexts();

  const scored = contexts
    .map((c) => {
      const title = normalize(c.work.title);
      const titleMatch = title.includes(needle);
      const creatorMatch = c.work.creators.some((x) => normalize(x).includes(needle));
      const characterMatch = c.work.characters.some((x) => normalize(x).includes(needle));
      if (!titleMatch && !creatorMatch && !characterMatch) return null;
      const rank = titleMatch ? 2 : characterMatch ? 1 : 0;
      return { rank, result: { workId: c.work.id, title: c.work.title, creators: c.work.creators, characters: c.work.characters } };
    })
    .filter((x): x is { rank: number; result: SearchWorkResult } => x !== null)
    .sort((a, b) => b.rank - a.rank);

  return scored.slice(0, limit).map((x) => x.result);
}

/** Distinct known character names in the catalog matching the query — used
 *  to detect "you typed a character name" and offer a journey playlist.
 *  Returns the best (shortest, most likely intended) match first. */
export function searchCharacters(query: string, limit = 5): string[] {
  const needle = normalize(query);
  if (!needle) return [];
  const contexts = loadAllWorkContexts();
  const names = new Set<string>();
  for (const c of contexts) {
    for (const name of c.work.characters) {
      if (normalize(name).includes(needle)) names.add(name);
    }
  }
  return [...names].sort((a, b) => a.length - b.length).slice(0, limit);
}
