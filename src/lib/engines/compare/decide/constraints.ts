// Facts that beat preferences, and the preferences that order what's left.
//
// HARD (tiering): a book that can't be read tonight — an earlier volume is
// unread, a required prerequisite is missing, it isn't in the reader's hands
// (or is in the wrong format for Travel Mode) — can't be #1 while a book that
// CAN be read exists. No 0.02 taste advantage may override that.
//
// SOFT (priority): among books in the same tier, a weighted blend orders them,
// with goal and continuity carrying the most weight.
import type { ScorableWork } from '../../../types/engine-io';
import { darknessOf } from './evaluate';
import type { Access, CandidateInput, DimensionKey, DimensionScore, Evidence, Intent } from './types';

export interface Evaluated {
  input: CandidateInput;
  workId: string;
  title: string;
  dims: DimensionScore[];
  access: Access;
  pros: Evidence[];
  cons: Evidence[];
  blockers: Evidence[];
  tier: 0 | 1;
  priority: number;
  /** Set only for single-criterion intents. */
  key: number | null;
}

export const scoreOf = (e: { dims: DimensionScore[] }, key: DimensionKey) => e.dims.find((d) => d.key === key)!.score;

/** 0 = readable tonight with nothing in the way; 1 = needs something first. */
export function tierOf(blockers: Evidence[], access: Access): 0 | 1 {
  return blockers.length === 0 && access.status === 'available' ? 0 : 1;
}

/** Base soft weights. Readiness and experience carry none: readiness is a
 *  gate (handled by tiers) and experience only describes the book. */
const BASE: Record<DimensionKey, number> = {
  readiness: 0, goal: 0.30, continuity: 0.20, taste: 0.15, mood: 0.08,
  experience: 0, character: 0.06, access: 0.09, commitment: 0.04, variety: 0.08,
};

export interface Weights { w: Record<DimensionKey, number>; intent: Intent }

/** Temporary "what matters tonight" reshapes the weights — visibly, and only
 *  for that request. "Continue a path" strengthens goal and continuity;
 *  the single-criterion intents ("darkest", "short", "different") are handled
 *  as a PRIMARY key in rank() instead, because a blend can't honour "the
 *  darkest one" — that request means darkness leads. */
export function weightsFor(intent: Intent, opts: { hasMood: boolean }): Weights {
  const w = { ...BASE };
  if (!opts.hasMood) w.mood = 0; // nothing to match: don't let a constant dilute the rest
  if (intent === 'continue_path') { w.goal *= 2.5; w.continuity *= 1.5; }
  return { w, intent };
}

/** The one thing the reader asked to be ranked on tonight, or null for a
 *  normal request. Bucketed to 0.1 steps so a hair's difference doesn't
 *  override everything else. */
export function intentKey(intent: Intent, work: ScorableWork, dims: DimensionScore[]): number | null {
  const bucket = (x: number) => Math.round(x * 10);
  switch (intent) {
    case 'darkest': return bucket(darknessOf(work));
    case 'short': return bucket(dims.find((d) => d.key === 'commitment')!.score);
    case 'different': return bucket(dims.find((d) => d.key === 'variety')!.score);
    default: return null;
  }
}

export function priorityOf(dims: DimensionScore[], weights: Weights): number {
  let sum = 0;
  let total = 0;
  for (const d of dims) {
    const wt = weights.w[d.key];
    if (!wt) continue;
    sum += wt * d.score;
    total += wt;
  }
  return total ? sum / total : 0;
}
