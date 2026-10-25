// Structured reasons. Every claim the reader is shown ("continues directly
// from The Long Halloween, which you've finished") starts as an Evidence
// object carrying the entities behind it, and its sentence is rendered from
// a template for that type — never written free-hand, never guessed.
import type { ScorableWork } from '../../../types/engine-io';
import { commitmentWord } from './evaluate';
import type {
  Access, CandidateInput, ComparisonContext, DimensionScore, Evidence, EvidenceType,
} from './types';

type Polarity = Evidence['polarity'];

const lower = (s: string) => s.toLowerCase();

/** Sentence templates, keyed by type. `data` supplies the entities. */
export function renderEvidence(type: EvidenceType, polarity: Polarity, d: Record<string, string>): string {
  switch (type) {
    case 'direct_continuation': return `Continues directly from ${d.previous}, which you’ve already finished.`;
    case 'active_path_progress': return `Advances your ${d.arc} journey — ${d.chapter}.`;
    case 'in_journey': return `Part of your ${d.arc} journey, but not the next step.`;
    case 'in_progress': return 'You’re already partway through it.';
    case 'earlier_unread': return `Comes after ${d.previous}, which you haven’t finished yet.`;
    case 'missing_prerequisite': return `Needs ${d.previous} read first.`;
    case 'ready_in_hand': return `You already have it (${lower(d.label)}).`;
    case 'not_available_now': return `Not available tonight — you only have it as ${lower(d.label)}.`;
    case 'not_owned': return 'You don’t have it yet.';
    case 'taste_genre': return `You tend to enjoy ${d.genre} stories, and this is one.`;
    case 'taste_character': return `You’ve responded well to ${d.character}.`;
    case 'taste_general': return polarity === 'con'
      ? 'Not a strong match for your taste right now.'
      : 'Close to the kind of story you usually enjoy.';
    case 'mood_match': return 'Matches your mood tonight.';
    case 'off_mood': return 'Doesn’t match your mood tonight.';
    case 'short_read': return 'A shorter read.';
    case 'long_read': return 'A big time commitment.';
    case 'change_of_pace': return d.recent
      ? `A real change of pace from ${d.recent}.`
      : 'A change of pace from what you’ve read lately.';
    case 'same_lane': return d.recent
      ? `Similar to ${d.recent}, which you read recently.`
      : 'Similar to what you’ve been reading lately.';
    case 'off_goal': return `Doesn’t advance your ${d.arc} journey.`;
    case 'reread': return 'You’ve read this one before.';
  }
}

const ev = (type: EvidenceType, polarity: Polarity, strength: Evidence['strength'], data: Record<string, string> = {}): Evidence => ({
  type, polarity, strength, data, text: renderEvidence(type, polarity, data),
});

const STRONG_AFFINITY = 0.3;

function tasteEvidence(work: ScorableWork, tasteScore: number, ctx: ComparisonContext): Evidence | null {
  const aff = ctx.profile.affinities;
  const genre = work.genres
    .map((g) => ({ g, a: aff.genre[g] }))
    .filter((x) => x.a && x.a.seen > 0 && x.a.score >= STRONG_AFFINITY)
    .sort((a, b) => b.a.score - a.a.score)[0];
  if (genre) return ev('taste_genre', 'pro', genre.a.score >= 0.6 ? 'major' : 'minor', { genre: genre.g });
  const ch = work.characters
    .map((c) => ({ c, a: aff.character[c] }))
    .filter((x) => x.a && x.a.seen > 0 && x.a.score >= STRONG_AFFINITY)
    .sort((a, b) => b.a.score - a.a.score)[0];
  if (ch) return ev('taste_character', 'pro', 'minor', { character: ch.c });
  if (tasteScore >= 0.65) return ev('taste_general', 'pro', 'minor');
  if (tasteScore < 0.4) return ev('taste_general', 'con', 'minor');
  return null;
}

/** All the facts behind one candidate, split by whether they help, hurt, or
 *  outright stop it being read tonight. */
export function buildEvidence(
  c: CandidateInput,
  dims: DimensionScore[],
  access: Access,
  ctx: ComparisonContext,
): { pros: Evidence[]; cons: Evidence[]; blockers: Evidence[] } {
  const score = (k: DimensionScore['key']) => dims.find((d) => d.key === k)!.score;
  const pros: Evidence[] = [];
  const cons: Evidence[] = [];
  const blockers: Evidence[] = [];
  const { work, journey, predecessors } = c;

  // -- hard facts: order & prerequisites ---------------------------------------
  for (const p of predecessors) {
    if (p.state === 'finished') continue;
    if (p.kind === 'required_context') blockers.push(ev('missing_prerequisite', 'block', 'major', { previous: p.title }));
    else blockers.push(ev('earlier_unread', 'block', 'major', { previous: p.title }));
  }

  // -- story position ------------------------------------------------------------
  const finishedSequels = predecessors.filter((p) => p.kind === 'direct_sequel' && p.state === 'finished');
  if (c.state === 'reading') pros.push(ev('in_progress', 'pro', 'major'));
  else if (finishedSequels.length && !blockers.length) {
    pros.push(ev('direct_continuation', 'pro', 'major', { previous: finishedSequels[finishedSequels.length - 1].title }));
  }

  // -- goal ----------------------------------------------------------------------
  if (journey?.isNext) {
    pros.push(ev('active_path_progress', 'pro', 'major', { arc: journey.arcTitle, chapter: journey.chapterTitle, milestone: journey.milestoneTitle }));
  } else if (journey) {
    pros.push(ev('in_journey', 'pro', 'minor', { arc: journey.arcTitle }));
  } else if (ctx.activeJourneys.length) {
    cons.push(ev('off_goal', 'con', 'major', { arc: ctx.activeJourneys[0] }));
  }

  // -- access --------------------------------------------------------------------
  if (access.status === 'available') pros.push(ev('ready_in_hand', 'pro', 'minor', { label: access.label }));
  else if (access.status === 'not_now') cons.push(ev('not_available_now', 'con', 'major', { label: access.label }));
  else cons.push(ev('not_owned', 'con', 'major'));

  // -- taste / mood --------------------------------------------------------------
  const taste = tasteEvidence(work, score('taste'), ctx);
  if (taste) (taste.polarity === 'pro' ? pros : cons).push(taste);
  if (ctx.mood) {
    if (score('mood') === 1) pros.push(ev('mood_match', 'pro', 'minor'));
    else cons.push(ev('off_mood', 'con', 'minor'));
  }

  // -- effort & freshness --------------------------------------------------------
  const commitment = commitmentWord(work);
  if (commitment === 'Short') pros.push(ev('short_read', 'pro', 'minor'));
  else if (commitment === 'Long') cons.push(ev('long_read', 'con', 'minor'));

  const recentTitle = ctx.recentFinished[0] ? ctx.titleById.get(ctx.recentFinished[0].workId) ?? '' : '';
  if (ctx.recentFinished.length) {
    const v = score('variety');
    if (v >= 0.75) pros.push(ev('change_of_pace', 'pro', 'minor', { recent: recentTitle }));
    else if (v < 0.4) cons.push(ev('same_lane', 'con', 'minor', { recent: recentTitle }));
  }

  if (c.state === 'finished') cons.push(ev('reread', 'con', 'minor'));

  const byStrength = (a: Evidence, b: Evidence) => (a.strength === b.strength ? 0 : a.strength === 'major' ? -1 : 1);
  return { pros: pros.sort(byStrength), cons: cons.sort(byStrength), blockers };
}
