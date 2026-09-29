// Turns the 10 dimension scores into an actual decision — the brief is
// explicit that "Comic A score 8.7 / Comic B score 8.4" isn't a real answer.
// Compare owes the reader a verb: READ FIRST / READ NEXT / SAVE FOR LATER /
// SKIP FOR NOW, each with a short, honest "why" built from real signals, not
// an LLM guessing at a plausible-sounding paragraph.
import { qualityLabel, scoreDimensions, type CompareContext, type CompareDimension, type CompareWorkInput } from './dimensions';

export type ReadVerdictCategory = 'read_first' | 'read_next' | 'save_for_later' | 'skip_for_now';

export interface CompareResult {
  workId: string;
  category: ReadVerdictCategory;
  overallScore: number; // 0..1, internal ranking only — never shown as a bare number
  dimensions: CompareDimension[];
  reasons: string[];
}

// Readiness and availability get a practical weight advantage (the brief:
// "Owned books should generally get a practical advantage"); the rest split
// the remaining weight across taste/mood/story/character/variety signals.
// Commitment intentionally carries the least weight — it's mostly
// informational (the label always states the real length), not a strong
// preference signal on its own.
const WEIGHTS: Record<Exclude<CompareDimension['key'], 'readiness'>, number> = {
  tasteMatch: 0.20,
  moodMatch: 0.12,
  storyFit: 0.12,
  artwork: 0.08,
  characterInterest: 0.10,
  commitment: 0.05,
  availability: 0.15,
  pathRelevance: 0.10,
  variety: 0.08,
};

function overallScore(dims: CompareDimension[]): number {
  let sum = 0;
  for (const d of dims) {
    if (d.key === 'readiness') continue;
    sum += WEIGHTS[d.key] * d.score;
  }
  return sum;
}

function dim(dims: CompareDimension[], key: CompareDimension['key']): CompareDimension {
  return dims.find((d) => d.key === key)!;
}

function reasonsFor(input: CompareWorkInput, dims: CompareDimension[]): string[] {
  const reasons: string[] = [];
  const readiness = dim(dims, 'readiness');
  const availability = dim(dims, 'availability');
  const taste = dim(dims, 'tasteMatch');
  const mood = dim(dims, 'moodMatch');
  const path = dim(dims, 'pathRelevance');
  const variety = dim(dims, 'variety');
  const character = dim(dims, 'characterInterest');

  if (!readiness.score || readiness.score < 0.5) {
    reasons.push(input.blockedByTitles.length
      ? `Needs you to read this first: ${input.blockedByTitles.slice(0, 2).join(', ')}.`
      : 'Requires context you don\'t have yet.');
    return reasons; // nothing else matters if it isn't ready
  }

  if (availability.score >= 0.85) reasons.push(`You already own it (${availability.label.toLowerCase()}).`);
  else if (availability.score <= 0.35) reasons.push('Not owned yet.');

  if (path.score === 1) reasons.push('Continues the path you\'re currently reading.');
  else if (path.score === 0.5) reasons.push('Next up in a path you haven\'t started.');

  if (mood.score === 1) reasons.push('Matches your current mood.');

  if (taste.score >= 0.7) reasons.push('Strongly matches your taste.');
  else if (taste.score < 0.4) reasons.push('Not a strong match for your taste right now.');

  if (character.score >= 0.7 && reasons.length < 4) reasons.push('Features characters or creators you\'ve responded well to before.');

  if (variety.score >= 0.7 && reasons.length < 4) reasons.push('A real change of pace from what you\'ve read recently.');
  else if (variety.score < 0.35 && reasons.length < 4) reasons.push('Similar to what you\'ve been reading a lot of lately.');

  return reasons.slice(0, 4);
}

function categorize(score: number, ready: boolean, rankAmongReady: number): ReadVerdictCategory {
  if (!ready) return 'skip_for_now';
  if (score < 0.35) return 'skip_for_now';
  if (rankAmongReady === 0 && score >= 0.45) return 'read_first';
  if (score >= 0.55) return 'read_next';
  return 'save_for_later';
}

/** Ranks every candidate for "what should I read next", in one pass —
 *  readiness gates the category (an unready book can't be READ FIRST no
 *  matter how well it fits taste), everything else is a weighted blend of
 *  the other 9 dimensions. */
export function rankForRead(candidates: CompareWorkInput[], ctx: CompareContext): CompareResult[] {
  const scored = candidates.map((input) => {
    const dims = scoreDimensions(input, ctx);
    return { input, dims, score: overallScore(dims), ready: dims.find((d) => d.key === 'readiness')!.score >= 0.5 };
  });

  const readyScoresDesc = [...scored].filter((s) => s.ready).sort((a, b) => b.score - a.score);
  const rankOf = new Map(readyScoresDesc.map((s, i) => [s.input.work.id, i]));

  return scored.map((s) => ({
    workId: s.input.work.id,
    category: categorize(s.score, s.ready, rankOf.get(s.input.work.id) ?? -1),
    overallScore: s.score,
    dimensions: s.dims,
    reasons: reasonsFor(s.input, s.dims),
  }));
}

export interface CompareChallenge {
  shouldChallenge: boolean;
  betterAlternativeWorkId: string | null;
  message: string | null;
}

// How much better an alternative has to be before Compare interrupts with
// "none of these" — small enough to matter, large enough that it isn't
// flip-flopping over noise. See the brief's "Allow Compare to challenge the
// user's choices" section.
const CHALLENGE_MARGIN = 0.15;

/** Compares the best result IN the compared set against one candidate that
 *  is NOT in the set (typically: best owned-unread book overall). If the
 *  outside option clearly wins, Compare should say so instead of quietly
 *  ranking the compared set among themselves. */
export function challengeWithAlternative(
  results: CompareResult[],
  alternative: CompareWorkInput | null,
  ctx: CompareContext,
): CompareChallenge {
  const none: CompareChallenge = { shouldChallenge: false, betterAlternativeWorkId: null, message: null };
  if (!alternative) return none;
  if (results.some((r) => r.workId === alternative.work.id)) return none; // already in the set

  const altDims = scoreDimensions(alternative, ctx);
  const altReady = altDims.find((d) => d.key === 'readiness')!.score >= 0.5;
  if (!altReady) return none;
  const altScore = overallScore(altDims);

  const bestCompared = results.reduce((best, r) => (r.overallScore > best.overallScore ? r : best), results[0] ?? null);
  if (!bestCompared) return none;

  if (altScore - bestCompared.overallScore < CHALLENGE_MARGIN) return none;

  const allSkip = results.every((r) => r.category === 'skip_for_now');
  return {
    shouldChallenge: true,
    betterAlternativeWorkId: alternative.work.id,
    message: allSkip
      ? 'None of these should be your next read.'
      : 'You already own a better option than any of these.',
  };
}

export { qualityLabel };
export type { CompareDimension, CompareWorkInput, CompareContext };
