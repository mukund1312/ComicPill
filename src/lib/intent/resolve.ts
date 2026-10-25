// Intent -> journey. The model tells us what the reader WANTS; which journey
// exists, what it contains, and how deep it goes is decided here from the
// app's own template data. Nothing in this file (or the model) invents a
// reading order.
import { buildArc } from '../engines/arc/build';
import { ARC_TEMPLATES } from '../engines/arc/templates';
import { DEFAULT_ARC_DEPTH, type ArcDepth, type ArcTemplate } from '../engines/arc/types';
import type { ReadingIntent } from './schema';

export const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

/** Every term that should make a request point at this template. */
export function templateKeywords(t: ArcTemplate): string[] {
  const terms = new Set<string>();
  const add = (s?: string) => { if (s && s.trim()) terms.add(norm(s)); };
  add(t.character);
  t.aliases?.forEach(add);
  if (t.family) {
    add(t.family.root);
    for (const b of t.family.branches) {
      add(b.name);
      add(b.name.split(' ')[0]); // "Dick", "Jason", "Damian"
      b.identities.forEach((i) => add(i.label));
    }
  }
  for (const c of t.chapters) for (const m of c.milestones) add(m.character);
  return [...terms];
}

/** The keyword a focus phrase points at, if any ("Batman origin" -> "batman").
 *  Exact match wins; then the longest keyword CONTAINED in the phrase. A
 *  phrase that is merely a fragment of a longer keyword does not count — "Robin"
 *  must not resolve to "Red Robin". */
export function matchFocus(focus: string, keywords: string[]): string | null {
  const n = norm(focus);
  if (keywords.includes(n)) return n.trim();
  const contained = keywords.filter((k) => n.includes(k)).sort((a, b) => b.length - a.length);
  return contained.length ? contained[0].trim() : null;
}

export interface AvailableJourney { key: string; title: string; character: string }

export type ResolvedArc =
  | {
    kind: 'match';
    templateKey: string;
    title: string;
    depth: ArcDepth;
    /** Focus phrases the journey actually covers, and what they matched. */
    matchedFocus: { focus: string; keyword: string }[];
    /** Focus phrases the journey does not specifically cover — shown, never hidden. */
    unmatchedFocus: string[];
    /** Chapter titles at this depth, in order — what the reader is told they're getting. */
    chapterOutline: string[];
    score: number;
  }
  | { kind: 'no_goal' }
  | { kind: 'no_template'; available: AvailableJourney[] };

const CHARACTER_POINTS = 5;
const MIN_SCORE_WITHOUT_CHARACTER = 2;

export function resolveArc(intent: ReadingIntent, templates: ArcTemplate[] = Object.values(ARC_TEMPLATES)): ResolvedArc {
  const goal = intent.newGoal;
  if (!goal) return { kind: 'no_goal' };

  let best: { t: ArcTemplate; score: number; matched: { focus: string; keyword: string }[] } | null = null;
  for (const t of templates) {
    const keywords = templateKeywords(t);
    let score = 0;
    const who = goal.character;
    if (who && (norm(who) === norm(t.character) || keywords.includes(norm(who)))) {
      score += CHARACTER_POINTS;
      // A journey that NAMES this character (its subject or a curated alias) beats one that merely
      // mentions them — "Dick Grayson" is Nightwing's story, and only a family member in Batman's.
      const named = norm(who) === norm(t.character) || (t.aliases ?? []).some((a) => norm(a) === norm(who));
      if (named) score += 1;
    }
    const matched: { focus: string; keyword: string }[] = [];
    for (const f of goal.focus) {
      const k = matchFocus(f, keywords);
      if (k) { matched.push({ focus: f, keyword: k }); score += 1; }
    }
    const qualifies = score >= CHARACTER_POINTS || score >= MIN_SCORE_WITHOUT_CHARACTER;
    if (qualifies && (!best || score > best.score)) best = { t, score, matched };
  }

  if (!best) {
    return {
      kind: 'no_template',
      available: templates.map((t) => ({ key: t.key, title: t.title, character: t.character })),
    };
  }

  const depth = intent.depth ?? DEFAULT_ARC_DEPTH;
  const matchedSet = new Set(best.matched.map((m) => m.focus));
  return {
    kind: 'match',
    templateKey: best.t.key,
    title: best.t.title,
    depth,
    matchedFocus: best.matched,
    unmatchedFocus: goal.focus.filter((f) => !matchedSet.has(f)),
    chapterOutline: buildArc(best.t, depth, new Map()).chapters.map((c) => c.title),
    score: best.score,
  };
}
