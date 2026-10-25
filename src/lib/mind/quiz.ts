// The first-run quiz: rate 15–20 comics already read, so the first scores aren't blind.
// Candidates come from the local catalog — well-known titles spread across genres, no network.
import { quizCandidates } from './catalogDb';
import { enrichSeries, type Deps } from './pipeline';
import { rate } from './queries';
import type { ExternalSeries } from './remote/types';

export const QUIZ_TARGET = 15;

export const quizDeck = (): ExternalSeries[] => quizCandidates(40);

/** Record one answer: a rating 1–5, or dropped. A skip records nothing. */
export async function answerQuiz(ext: ExternalSeries, answer: { rating: number } | { dropped: true }, deps: Deps): Promise<void> {
  const { id } = await enrichSeries(ext, deps, deps.now());
  if ('dropped' in answer) rate(id, 1, true); else rate(id, answer.rating);
}
