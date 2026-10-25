// The Compare V2 entry point:  candidates -> a decision.
//
//   eligibility -> evaluate -> tier (hard) -> priority (soft) -> sequence
//   -> roles -> pairwise -> explanation
//
// Pure and deterministic: same inputs, same answer, and every sentence in the
// result comes from a template filled with real entities (see evidence.ts).
import { partitionCandidates } from './eligibility';
import { accessFor, evaluateDimensions } from './evaluate';
import { buildEvidence } from './evidence';
import { intentKey, priorityOf, scoreOf, tierOf, weightsFor, type Evaluated, type Weights } from './constraints';
import { enforceStoryOrder, storyRelationships } from './sequence';
import { pairwise } from './pairwise';
import { buildGlance } from './glance';
import type {
  AnswerChange, CandidateInput, ComparisonContext, Evidence, Intent, Pairwise, RankedEntry, ReadDecision, Relationship, Role,
} from './types';

const shortArc = (title: string) => title.split(':')[0].trim() || title;
const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

function evaluateOne(c: CandidateInput, ctx: ComparisonContext): Evaluated {
  const dims = evaluateDimensions(c, ctx);
  const access = accessFor(c.work.own, ctx.travelMode);
  const { pros, cons, blockers } = buildEvidence(c, dims, access, ctx);
  return {
    input: c, workId: c.work.id, title: c.work.title, dims, access, pros, cons, blockers,
    tier: tierOf(blockers, access), priority: 0, key: null,
  };
}

/** Tier first (hard), then weighted priority (soft), then story order. Ties
 *  break on title so the same inputs always give the same order. */
function rank(evals: Evaluated[], ctx: ComparisonContext, intent: Intent): { ordered: Evaluated[]; weights: Weights } {
  const weights = weightsFor(intent, { hasMood: !!ctx.mood });
  const scored = evals.map((e) => ({ ...e, priority: priorityOf(e.dims, weights), key: intentKey(intent, e.input.work, e.dims) }));
  scored.sort((a, b) =>
    a.tier - b.tier
    || (b.key ?? 0) - (a.key ?? 0)
    || b.priority - a.priority
    || a.title.localeCompare(b.title)
    || a.workId.localeCompare(b.workId));
  return { ordered: enforceStoryOrder(scored), weights };
}

function statusLine(e: Evaluated): string {
  if (e.access.status === 'not_owned') return 'Not owned';
  const state = e.input.state === 'reading' ? 'Reading' : e.input.state === 'finished' ? 'Finished' : 'Unread';
  return `${e.access.label} • Owned • ${state}`;
}

function headlineFor(top: Evaluated): string {
  const j = top.input.journey;
  if (top.input.state === 'reading') return 'Finish what you started.';
  if (top.blockers.length) return `Read ${top.blockers[0].data.previous} first.`;
  if (top.access.status !== 'available') return 'Get this one first.';
  if (j?.isNext) return `Continue your ${shortArc(j.arcTitle)} journey.`;
  if (top.pros.some((p) => p.type === 'direct_continuation')) return 'Continue the story you’re on.';
  return 'The best fit for you right now.';
}

function explanationFor(top: Evaluated): string {
  const lead: Evidence['type'][] = ['direct_continuation', 'in_progress', 'active_path_progress', 'ready_in_hand'];
  const parts = lead.flatMap((t) => top.pros.filter((p) => p.type === t)).map((p) => p.text);
  if (parts.length < 2) for (const p of top.pros) if (!parts.includes(p.text) && parts.length < 3) parts.push(p.text);
  if (top.tier === 1) for (const t of [...top.blockers, ...top.cons.filter((c) => c.strength === 'major')].slice(0, 2)) parts.push(t.text);
  return parts.length ? parts.join(' ') : 'It is the strongest option in this set.';
}

function bestForOf(e: Evaluated): string {
  const has = (t: Evidence['type']) => e.pros.find((p) => p.type === t);
  const active = has('active_path_progress');
  if (has('in_progress')) return 'Finishing what you started';
  if (active) return `Continuing your ${shortArc(active.data.arc)} journey`;
  const cont = has('direct_continuation');
  if (cont) return `Continuing from ${cont.data.previous}`;
  const genre = has('taste_genre');
  if (genre) return `When you want more ${genre.data.genre} stories`;
  if (has('mood_match')) return 'When it matches your mood';
  if (has('short_read')) return 'A quick read';
  if (has('change_of_pace')) return 'A change of pace';
  return 'When it fits your mood';
}

function roleFor(e: Evaluated, position: number, hasGoal: boolean): Role {
  if (e.tier === 1) return e.blockers.length ? 'blocked' : 'get_first';
  if (position === 1) return 'read_now';
  const tasteStrong = scoreOf(e, 'taste') >= 0.6;
  if (hasGoal && !e.input.journey && tasteStrong) return 'detour';
  return position === 2 ? 'read_after' : 'later';
}

const INTENT_LABEL = (intent: Intent, journeyName: string | null): string => {
  switch (intent) {
    case 'continue_path': return journeyName ? `Continue your ${journeyName} journey` : 'Continue a path';
    case 'darkest': return 'The darkest story';
    case 'short': return 'A shorter read';
    case 'different': return 'A change of pace';
    case 'best': return 'Best overall';
  }
};

export function decideRead(candidates: CandidateInput[], ctx: ComparisonContext): ReadDecision {
  const { eligible, excluded } = partitionCandidates(candidates, ctx);
  const evals = eligible.map((c) => evaluateOne(c, ctx));
  const { ordered, weights } = rank(evals, ctx, ctx.intent);
  const hasGoal = ordered.some((e) => e.input.journey);
  const top = ordered[0] ?? null;
  const second = ordered[1] ?? null;

  // -- pairwise: the winner against everyone, plus each adjacent pair ------------
  const pairs: Pairwise[] = [];
  const seen = new Set<string>();
  const addPair = (w: Evaluated, o: Evaluated) => {
    const k = `${w.workId}>${o.workId}`;
    if (seen.has(k)) return;
    seen.add(k);
    pairs.push(pairwise(w, o, weights));
  };
  if (top) for (const o of ordered.slice(1)) addPair(top, o);
  for (let i = 1; i < ordered.length - 1; i += 1) addPair(ordered[i], ordered[i + 1]);

  // -- entries ----------------------------------------------------------------------
  const order: RankedEntry[] = ordered.map((e, i) => {
    const position = i + 1;
    const vsTop = top && i > 0 ? pairwise(top, e, weights) : null;
    const whyNotFirst = vsTop
      ? vsTop.factors.filter((f) => f.favors === 'winner').slice(0, 2).map((f) => sentence(`${top!.title} ${f.text}`))
      : [];
    return {
      position, workId: e.workId, title: e.title, role: roleFor(e, position, hasGoal), tier: e.tier, priority: e.priority,
      dimensions: e.dims, access: e.access, pros: e.pros, cons: e.cons, blockers: e.blockers,
      caseFor: e.pros.slice(0, 4).map((p) => p.text),
      caseAgainst: [...e.blockers, ...e.cons].slice(0, 3).map((c) => c.text),
      whyNotFirst, bestFor: bestForOf(e),
      tradeOff: [...e.blockers, ...e.cons][0]?.text ?? null,
      isReread: e.input.state === 'finished',
    };
  });

  // -- confidence --------------------------------------------------------------------
  let confidence: ReadDecision['confidence'] = 'high';
  let closeCall: string | null = null;
  if (top && second) {
    const decidedBy = pairs.find((p) => p.winnerId === top.workId && p.otherId === second.workId)?.decidedBy;
    const margin = top.priority - second.priority;
    const hard = top.tier < second.tier || decidedBy === 'order' || decidedBy === 'constraint' || decidedBy === 'intent';
    confidence = hard || margin >= 0.12 ? 'high' : margin >= 0.05 ? 'medium' : 'low';
    if (confidence !== 'high') {
      const lead = pairs.find((p) => p.winnerId === top.workId && p.otherId === second.workId)?.factors.find((f) => f.favors === 'winner');
      closeCall = lead
        ? `Close call: ${top.title} and ${second.title} both fit you well. ${top.title} edges ahead because it ${lead.text}, but if that doesn’t matter tonight, ${second.title} is equally reasonable.`
        : `Close call: ${top.title} and ${second.title} are effectively tied. Either is a reasonable choice tonight.`;
    }
  }

  // -- what would change the answer ----------------------------------------------
  const changesAnswer: AnswerChange[] = [];
  const journeyName = ordered.find((e) => e.input.journey)?.input.journey?.arcTitle ?? null;
  if (ordered.length >= 2) {
    for (const intent of ['continue_path', 'darkest', 'short', 'different'] as Intent[]) {
      if (intent === ctx.intent) continue;
      if (intent === 'continue_path' && !hasGoal) continue;
      const w = rank(evals, ctx, intent).ordered[0];
      if (w.workId !== top!.workId || intent === 'continue_path') {
        changesAnswer.push({ label: INTENT_LABEL(intent, journeyName ? shortArc(journeyName) : null), workId: w.workId, title: w.title });
      }
    }
  }
  if (!ctx.rereadsAllowed) {
    const finished = candidates.filter((c) => c.state === 'finished');
    if (finished.length) {
      const best = finished
        .map((c) => ({ c, taste: evaluateDimensions(c, ctx).find((d) => d.key === 'taste')!.score }))
        .sort((a, b) => b.taste - a.taste || a.c.work.title.localeCompare(b.c.work.title))[0];
      changesAnswer.push({ label: 'A reread', workId: best.c.work.id, title: best.c.work.title });
    }
  }

  // -- relationships -----------------------------------------------------------------
  const relationships: Relationship[] = storyRelationships(ordered);
  if (top && second && !relationships.some((r) => r.from === top.workId && r.to === second.workId)) {
    relationships.push({
      from: top.workId, to: second.workId, relation: 'RECOMMENDED_BEFORE',
      basis: top.input.journey?.isNext && !second.input.journey ? 'PATH_ORDER' : 'PREFERENCE_ORDER',
      reason: pairs.find((p) => p.winnerId === top.workId && p.otherId === second.workId)?.summary ?? '',
    });
  }

  return {
    context: { intent: ctx.intent, mood: ctx.mood, travelMode: ctx.travelMode, rereadsAllowed: ctx.rereadsAllowed, activeJourneys: ctx.activeJourneys },
    excluded,
    order,
    primary: top ? { workId: top.workId, title: top.title, headline: headlineFor(top), explanation: explanationFor(top), status: statusLine(top) } : null,
    thenNext: second ? { workId: second.workId, title: second.title } : null,
    beatsOthers: top ? ordered.slice(1).map((o) => ({ workId: o.workId, title: o.title, text: pairwise(top, o, weights).summary })) : [],
    pairwise: pairs,
    relationships,
    changesAnswer,
    glance: buildGlance(ordered, !!ctx.mood),
    confidence,
    closeCall,
  };
}
