// The taste score: a 0–100 prediction of how much you'll like a comic, built from your own ratings
// and always explainable. Five signals, each with a weight (a starting guess — edit in Settings).
export type Signal = 'genre' | 'creator' | 'tone' | 'art' | 'length';
export const SIGNALS: Signal[] = ['genre', 'creator', 'tone', 'art', 'length'];
export const SIGNAL_LABEL: Record<Signal, string> = { genre: 'Genre & theme', creator: 'Creators', tone: 'Tone & pacing', art: 'Art style', length: 'Length' };

export type Tags = Record<Signal, string[]>;
export type Weights = Record<Signal, number>;
export const DEFAULT_WEIGHTS: Weights = { genre: 0.3, creator: 0.25, tone: 0.2, art: 0.15, length: 0.1 };
export const emptyTags = (): Tags => ({ genre: [], creator: [], tone: [], art: [], length: [] });

export type RatingEvent = {
  tags: Tags;
  /** 1–5 stars. */
  rating: number;
  /** Dropped counts as the lowest rating and pushes its tags down hardest. */
  dropped?: boolean;
  /** 1 normally; an "I disagree" override is a strong signal and counts double. */
  weight?: number;
};

/** Pretend the profile already holds one neutral rating, so a single review can't swing a tag to ±1. */
const PRIOR = 1;

const norm = (t: string) => t.trim().toLowerCase();
const eventValue = (e: RatingEvent) => (e.dropped ? -1 : (Math.max(1, Math.min(5, e.rating)) - 3) / 2);

type TagStat = { sum: number; n: number };
export type Profile = Record<Signal, Map<string, TagStat>>;

export function buildProfile(events: RatingEvent[]): Profile {
  const profile = Object.fromEntries(SIGNALS.map((s) => [s, new Map<string, TagStat>()])) as Profile;
  for (const e of events) {
    const w = e.weight ?? 1; const v = eventValue(e);
    for (const sig of SIGNALS) for (const raw of e.tags[sig]) {
      const tag = norm(raw); if (!tag) continue;
      const stat = profile[sig].get(tag) ?? { sum: 0, n: 0 };
      stat.sum += w * v; stat.n += w; profile[sig].set(tag, stat);
    }
  }
  return profile;
}

export type Contribution = { tag: string; /** −1…+1, after shrinkage */ value: number; seen: number };
export type SignalBreakdown = { signal: Signal; weight: number; known: boolean; /** 0…1; 0.5 is neutral */ score: number; contributions: Contribution[] };
export type Confidence = 'low' | 'medium' | 'high';

export type ScoreResult = {
  score: number;
  confidence: Confidence;
  /** How many rated comics share a genre with this one. */
  evidence: number;
  breakdown: SignalBreakdown[];
};

export const confidenceFor = (evidence: number): Confidence => (evidence < 10 ? 'low' : evidence < 20 ? 'medium' : 'high');

export function scoreSeries(tags: Tags, profile: Profile, events: RatingEvent[], weights: Weights = DEFAULT_WEIGHTS): ScoreResult {
  const breakdown: SignalBreakdown[] = SIGNALS.map((signal) => {
    const contributions: Contribution[] = [];
    for (const raw of tags[signal]) {
      const stat = profile[signal].get(norm(raw));
      if (stat) contributions.push({ tag: norm(raw), value: stat.sum / (stat.n + PRIOR), seen: stat.n });
    }
    const known = contributions.length > 0;
    const mean = known ? contributions.reduce((a, c) => a + c.value, 0) / contributions.length : 0;
    return { signal, weight: weights[signal], known, score: (mean + 1) / 2, contributions };
  });

  const known = breakdown.filter((b) => b.known && b.weight > 0);
  const totalWeight = known.reduce((a, b) => a + b.weight, 0);
  // Signals we know nothing about are left out and the rest re-weighted, rather than pulling toward 50.
  const score = totalWeight > 0 ? Math.round((known.reduce((a, b) => a + b.weight * b.score, 0) / totalWeight) * 100) : 50;

  const genres = new Set(tags.genre.map(norm));
  const evidence = events.filter((e) => e.tags.genre.some((g) => genres.has(norm(g)))).length;
  return { score, confidence: confidenceFor(evidence), evidence, breakdown };
}

/** Plain-words reasons from the real matches: the strongest push up, and the strongest push down. */
export function reasonsFor(result: ScoreResult): string[] {
  const rows = result.breakdown.flatMap((b) => b.contributions.map((c) => ({ signal: b.signal, ...c, pull: b.weight * c.value })));
  const up = rows.filter((r) => r.pull > 0.01).sort((a, b) => b.pull - a.pull).slice(0, 2);
  const down = rows.filter((r) => r.pull < -0.01).sort((a, b) => a.pull - b.pull).slice(0, 1);
  const say = (r: { signal: Signal; tag: string }, positive: boolean) => {
    const what = r.signal === 'creator' ? r.tag : `${r.tag} ${r.signal === 'art' ? 'art' : r.signal === 'length' ? 'length' : r.signal === 'tone' ? 'tone' : ''}`.trim();
    return positive ? `You rate ${what} highly` : `You tend to rate ${what} lower`;
  };
  const lines = [...up.map((r) => say(r, true)), ...down.map((r) => say(r, false))];
  return lines.length ? lines : ['Not enough ratings near this one yet to say why.'];
}

/** What the reader's rating of 1–5 maps to on the 0–100 scale. */
export const ratingToScore = (rating: number) => Math.round((Math.max(1, Math.min(5, rating)) - 1) * 25);
/** An "I disagree" score back to stars, for the profile. */
export const scoreToRating = (score: number) => 1 + Math.max(0, Math.min(100, score)) / 25;

export type Calibration = {
  n: number;
  /** Mean absolute error in points, predicting each rating from all the others. */
  mae: number;
  /** Share of predictions within 10 points of the reader's own rating. */
  within10: number;
  perSignal: Record<Signal, { n: number; mae: number }>;
};

/** Leave-one-out: how well do scores predict ratings the model hasn't seen? */
export function calibrate(events: RatingEvent[], weights: Weights = DEFAULT_WEIGHTS): Calibration {
  const perSignal = Object.fromEntries(SIGNALS.map((s) => [s, { n: 0, mae: 0 }])) as Calibration['perSignal'];
  let n = 0; let abs = 0; let hit = 0;
  events.forEach((e, i) => {
    const rest = events.filter((_, j) => j !== i);
    const target = e.dropped ? 0 : ratingToScore(e.rating);
    const res = scoreSeries(e.tags, buildProfile(rest), rest, weights);
    n++; abs += Math.abs(res.score - target); if (Math.abs(res.score - target) <= 10) hit++;
    for (const b of res.breakdown) if (b.known) { perSignal[b.signal].n++; perSignal[b.signal].mae += Math.abs(b.score * 100 - target); }
  });
  for (const s of SIGNALS) if (perSignal[s].n) perSignal[s].mae /= perSignal[s].n;
  return { n, mae: n ? abs / n : 0, within10: n ? hit / n : 0, perSignal };
}

/** Nudge each weight toward how well that signal alone predicted your ratings (halfway, so it can't whiplash). */
export function suggestWeights(events: RatingEvent[], current: Weights = DEFAULT_WEIGHTS): Weights {
  const cal = calibrate(events, current);
  const skill = Object.fromEntries(SIGNALS.map((s) => [s, cal.perSignal[s].n >= 3 ? Math.max(0.05, 1 - cal.perSignal[s].mae / 50) : current[s]])) as Weights;
  const total = SIGNALS.reduce((a, s) => a + skill[s], 0);
  const out = {} as Weights;
  for (const s of SIGNALS) out[s] = Math.round((0.5 * current[s] + 0.5 * (skill[s] / total)) * 1000) / 1000;
  const sum = SIGNALS.reduce((a, s) => a + out[s], 0);
  for (const s of SIGNALS) out[s] = Math.round((out[s] / sum) * 1000) / 1000;
  return out;
}
