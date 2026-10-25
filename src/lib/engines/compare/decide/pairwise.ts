// Why A before B. Each pair is compared on the same weights that produced the
// order, and the result is expressed as the FEW factors that actually decided
// it — with the runner-up's real strengths conceded — rather than ten scores.
import { scoreOf, type Evaluated, type Weights } from './constraints';
import { storyEdges } from './sequence';
import type { DimensionKey, Intent, Pairwise, PairwiseFactor } from './types';

const MIN_DELTA = 0.012;
const MAX_FACTORS = 4;

/** A verb phrase saying what `fav` has going for it over `other` on this
 *  dimension, or null when there's nothing honest to say. Always specific:
 *  it names the journey, the previous book, the genre. */
export function factorClause(key: DimensionKey, fav: Evaluated, other: Evaluated): string | null {
  const j = fav.input.journey;
  switch (key) {
    case 'goal':
      if (j?.isNext) return `moves your ${j.arcTitle} journey forward`;
      if (j) return `is part of your ${j.arcTitle} journey`;
      return null;
    case 'continuity': {
      if (fav.input.state === 'reading') return 'is one you’re already partway through';
      const cont = fav.pros.find((p) => p.type === 'direct_continuation');
      if (cont) return `continues directly from ${cont.data.previous}`;
      if (j?.isNext) return 'is the next step in your journey';
      return other.blockers.length ? null : 'sits earlier in the story';
    }
    case 'taste': {
      const g = fav.pros.find((p) => p.type === 'taste_genre');
      return g ? `is a closer match for your taste for ${g.data.genre}` : 'is a closer match for your taste';
    }
    case 'mood': return 'fits your mood tonight better';
    case 'character': return 'has characters you’ve responded to more';
    case 'access': return fav.access.status === 'available' ? `is ready to read now (${fav.access.label.toLowerCase()})` : null;
    case 'commitment': return 'is the shorter read';
    case 'variety': return 'is more of a change of pace';
    case 'readiness': return 'is ready to read';
    case 'experience': return null;
  }
}

const INTENT_TEXT: Record<Exclude<Intent, 'best' | 'continue_path'>, string> = {
  darkest: 'is the darker story, which is what you asked for',
  short: 'is the shorter read, which is what you asked for',
  different: 'is more of a change of pace, which is what you asked for',
};

const KEYS: DimensionKey[] = ['goal', 'continuity', 'taste', 'mood', 'character', 'access', 'commitment', 'variety', 'readiness'];

function summarize(winner: Evaluated, other: Evaluated, factors: PairwiseFactor[]): string {
  const decider = factors.find((f) => f.favors === 'winner');
  const concession = factors.find((f) => f.favors === 'other');
  if (!decider) return `${winner.title} and ${other.title} are effectively tied on the evidence.`;
  const d = `${winner.title} ${decider.text}`;
  return concession ? `${other.title} ${concession.text}, but ${d}.` : `${d}.`;
}

/** Explain why `winner` comes before `other`. */
export function pairwise(winner: Evaluated, other: Evaluated, weights: Weights): Pairwise {
  // 1. Story order decides it (one is the other's predecessor) — the most
  //    meaningful reason, even when it also happens to block the sequel.
  const edge = storyEdges([winner, other]).find((e) => e.before === winner && e.after === other);
  if (edge) {
    const text = `comes before ${other.title} in the story`;
    return { winnerId: winner.workId, otherId: other.workId, decidedBy: 'order', factors: [{ key: 'order', favors: 'winner', text }], summary: `${winner.title} ${text}.` };
  }

  // 2. Some other hard constraint decides it.
  if (winner.tier < other.tier) {
    const why = other.blockers[0]?.text ?? other.cons.find((c) => c.type === 'not_available_now' || c.type === 'not_owned')?.text ?? 'It isn’t ready to read tonight.';
    const factors: PairwiseFactor[] = [{ key: 'readiness', favors: 'winner', text: `can be read now, while ${other.title} can’t: ${why.charAt(0).toLowerCase()}${why.slice(1)}` }];
    return { winnerId: winner.workId, otherId: other.workId, decidedBy: 'constraint', factors, summary: `${winner.title} ${factors[0].text}` };
  }

  // 3a. A single-criterion request ("the darkest") decided it.
  if (winner.key !== null && other.key !== null && winner.key !== other.key) {
    const text = INTENT_TEXT[weights.intent as Exclude<Intent, 'best' | 'continue_path'>];
    const factors: PairwiseFactor[] = [{ key: 'intent', favors: 'winner', text }];
    return { winnerId: winner.workId, otherId: other.workId, decidedBy: 'intent', factors, summary: `${winner.title} ${text}.` };
  }

  // 3b. Weighted comparison on the same weights that produced the order.
  const active = KEYS.filter((k) => weights.w[k] > 0);
  const deltas = active
    .map((k) => ({ k, d: weights.w[k] * (scoreOf(winner, k) - scoreOf(other, k)) }))
    .filter((x) => Math.abs(x.d) >= MIN_DELTA)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d));

  const factors: PairwiseFactor[] = [];
  for (const { k, d } of deltas) {
    const favors = d > 0 ? 'winner' : 'other';
    const text = factorClause(k, favors === 'winner' ? winner : other, favors === 'winner' ? other : winner);
    if (text) factors.push({ key: k, favors, text });
    if (factors.length >= MAX_FACTORS) break;
  }
  const decidedBy = (factors.find((f) => f.favors === 'winner')?.key ?? 'tie') as Pairwise['decidedBy'];
  return { winnerId: winner.workId, otherId: other.workId, decidedBy, factors, summary: summarize(winner, other, factors) };
}
