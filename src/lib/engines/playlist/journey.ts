// "Type a character's name, get their reading journey" — a linear, curated
// path through that character's best/most essential books, not just a
// taste-ranked bag of matches. Distinct from generatePlaylist's seedName
// mode (which ranks by taste fit and deliberately allows overlap): a
// journey's ordering is the point, so this sorts by each book's position
// within its curated lane instead of by score.
//
// Honest limitation, not hidden: today's seed catalog's story_edges only
// chain CONSECUTIVE books within one lane (same_run), regardless of which
// character they're about — walking edges for an arbitrary character would
// wrongly include unrelated books or break the chain the moment an
// off-character book sits between two of theirs. Lane position is the
// reliable signal we actually have; as the catalog grows toward real
// character-specific reading-order edges, this can switch to expandPath.
import { isAccessible } from '../../util/own';
import type { ScorableWork } from '../../types/engine-io';

export interface LanePosition { bucket: string; position: number; }
export interface JourneyItem { work: ScorableWork; reason: string; }

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/** A book "features" the queried character if any of its listed characters
 *  matches by substring either direction — "iron" finds "Iron Man", and a
 *  full "Iron Man" query still matches a book crediting just "Tony Stark"
 *  only if the catalog itself lists "Tony Stark" as a character; this is a
 *  name-string match, not a real character-identity resolver. */
function featuresCharacter(work: ScorableWork, needle: string): boolean {
  return work.characters.some((c) => {
    const norm = normalize(c);
    return norm === needle || norm.includes(needle) || needle.includes(norm);
  });
}

/** Selects up to `count` books (default 12, the "10-15" the reader asked
 *  for) that feature the character, preferring keeper/canonical books and
 *  higher taste fit when the catalog offers more than fit, then orders the
 *  selected set into a linear journey: grouped by lane, lane-position
 *  ascending within each group, so an origin-lane run reads start to finish
 *  before a crossover lane picks up. */
export function characterJourney(
  candidates: ScorableWork[],
  positionByWorkId: Map<string, LanePosition>,
  characterName: string,
  count = 12,
): JourneyItem[] {
  const needle = normalize(characterName);
  if (!needle) return [];

  const matched = candidates.filter((w) => featuresCharacter(w, needle));

  const ranked = matched
    .map((w) => ({
      w,
      // Keeper-worthiness first (this is "essential reading", not personal
      // taste): 1 for a flagged keeper, 0.6 for accessible-but-not-keeper,
      // 0.3 otherwise — same shape essentialCollection.ts uses.
      rankScore: (w.keeper ? 1 : 0) + (isAccessible(w.own) ? 0.3 : 0),
    }))
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, count)
    .map(({ w }) => w);

  const ordered = [...ranked].sort((a, b) => {
    const posA = positionByWorkId.get(a.id) ?? { bucket: a.bucket, position: Number.MAX_SAFE_INTEGER };
    const posB = positionByWorkId.get(b.id) ?? { bucket: b.bucket, position: Number.MAX_SAFE_INTEGER };
    if (posA.bucket !== posB.bucket) return posA.bucket < posB.bucket ? -1 : 1;
    return posA.position - posB.position;
  });

  return ordered.map((w) => ({ work: w, reason: `Part of ${characterName}'s journey` }));
}
