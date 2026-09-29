// "The app can make it for him" — a pure generator for an app-authored
// playlist. Reuses tasteFit (same fit function Today and Discover use) and
// the mood->genre mapping already established for Today's mood pills, so a
// generated playlist matches the same notion of "fits the mood" the reader
// already sees elsewhere in the app. Once generated, the playlist is a plain
// list of workIds like any other — the caller persists it and it becomes
// exactly as editable as a hand-built one.
import { tasteFit } from '../taste/fit';
import { MOOD_GENRES } from '../recommend/score';
import { isAccessible } from '../../util/own';
import type { ScorableWork, TasteProfile } from '../../types/engine-io';

export interface GeneratePlaylistOptions {
  mood?: string | null; // one of MOOD_GENRES' keys, or a character/creator name via `seedName`
  seedName?: string | null; // a character or creator to build the playlist around
  count: number;
  excludeWorkIds?: Set<string>;
  ownedOnly?: boolean;
}

export interface GeneratedItem { work: ScorableWork; reason: string; }

/** Ranks candidates by taste fit, boosted by mood-genre match and/or a seed
 *  name (character/creator), then diversifies so the same creator or
 *  character doesn't dominate the list — same variety rule buildDeck uses
 *  for the daily 5-card deck. */
export function generatePlaylist(
  candidates: ScorableWork[],
  profile: TasteProfile,
  options: GeneratePlaylistOptions,
): GeneratedItem[] {
  const excluded = options.excludeWorkIds ?? new Set<string>();
  const moodGenres = options.mood ? (MOOD_GENRES[options.mood] ?? []) : [];
  const seed = options.seedName?.toLowerCase() ?? null;

  const eligible = candidates.filter((w) => {
    if (excluded.has(w.id)) return false;
    if (options.ownedOnly && !isAccessible(w.own)) return false;
    return true;
  });

  const scored = eligible.map((w) => {
    const fit = tasteFit(w, profile);
    const moodMatch = moodGenres.length > 0 && w.genres.some((g) => moodGenres.includes(g));
    const seedMatch = seed != null && (
      w.characters.some((c) => c.toLowerCase() === seed) ||
      w.creators.some((c) => c.toLowerCase() === seed)
    );
    let score = fit;
    if (moodGenres.length > 0) score = moodMatch ? score + 0.3 : score * 0.7;
    if (seed != null) score = seedMatch ? score + 0.5 : score * 0.4;
    const reason = seedMatch
      ? `Features ${options.seedName}`
      : moodMatch
      ? `Matches the ${options.mood} mood`
      : `Fits your taste`;
    return { w, score, reason };
  }).sort((a, b) => b.score - a.score);

  const usedPeople = new Set<string>();
  const out: GeneratedItem[] = [];
  for (const { w, reason } of scored) {
    if (out.length >= options.count) break;
    const overlaps = w.creators.some((c) => usedPeople.has(c)) || w.characters.some((c) => usedPeople.has(c));
    // A seed playlist ("everything with this character") is meant to overlap
    // on purpose — the diversity rule only applies to taste/mood playlists.
    if (overlaps && seed == null) continue;
    out.push({ work: w, reason });
    w.creators.forEach((c) => usedPeople.add(c));
    w.characters.forEach((c) => usedPeople.add(c));
  }
  return out;
}
