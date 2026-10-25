// What kind of book is this, for THIS reader, right now? Produces the ten
// dimensions (redefined for V2) and the contextual access answer. Nothing
// here orders anything — ordering rules live in constraints/priority.
import { DIMENSIONS } from '../../../types/domain';
import type { Own } from '../../../types/domain';
import type { ScorableWork } from '../../../types/engine-io';
import { fatiguePenalty } from '../../taste/fatigue';
import { MOOD_GENRES } from '../../recommend/score';
import { avgAffinity, closenessOn, qualityLabel } from '../dimensions';
import type { Access, CandidateInput, ComparisonContext, DimensionScore, TravelMode } from './types';

const OWN_LABEL: Record<Own, string> = {
  physical: 'Physical', digital: 'Digital', both: 'Physical + digital', subscription: 'Subscription',
  ordered: 'Ordered', wishlist: 'Wishlist', none: 'Not owned',
};

/** Yes/no: can the reader open this tonight? Owning both formats is not
 *  "more available" than owning one, so it earns no extra credit. */
export function accessFor(own: Own, travel: TravelMode): Access {
  const label = OWN_LABEL[own];
  if (own === 'none' || own === 'wishlist' || own === 'ordered') return { status: 'not_owned', label };
  const hasDigital = own === 'digital' || own === 'both' || own === 'subscription';
  if (travel === 'digital' && !hasDigital) return { status: 'not_now', label };
  return { status: 'available', label };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Detective · Slow-burn · Dark" — what reading it is actually like. */
export function experienceOf(work: ScorableWork): string {
  const fp = work.fingerprint;
  const bits: string[] = work.genres.slice(0, 2).map(cap);
  if (fp) {
    if (fp.pace < 0.4) bits.push('Slow-burn'); else if (fp.pace > 0.66) bits.push('Fast-paced');
    if (fp.tone > 0.66) bits.push('Dark'); else if (fp.tone < 0.34) bits.push('Light');
    if (fp.mystery > 0.66) bits.push('Mystery-driven');
    if (fp.complexity > 0.66) bits.push('Layered');
    if (fp.violence > 0.66) bits.push('Intense');
  }
  return bits.slice(0, 3).join(' · ') || 'Standalone story';
}

/** How dark it reads: tone weighs most, violence adds to it. Used only when
 *  the reader asks for "the darkest". */
export const darknessOf = (work: ScorableWork) => work.fingerprint ? work.fingerprint.tone * 0.6 + work.fingerprint.violence * 0.4 : 0.5;

export function commitmentWord(work: ScorableWork): 'Short' | 'Medium' | 'Long' {
  const raw = work.fingerprint?.commitment ?? 0.5;
  return raw < 0.34 ? 'Short' : raw < 0.67 ? 'Medium' : 'Long';
}

export function evaluateDimensions(c: CandidateInput, ctx: ComparisonContext): DimensionScore[] {
  const { work, journey, predecessors } = c;
  const fp = work.fingerprint;

  // READINESS — can I properly read this? (a REQUIRED prerequisite is unread)
  const missing = predecessors.filter((p) => p.kind === 'required_context' && p.state !== 'finished');
  const readiness: DimensionScore = { key: 'readiness', score: missing.length ? 0.15 : 1, label: missing.length ? 'Missing context' : 'Ready' };

  // GOAL — does this advance what the reader said they want?
  let goal: DimensionScore;
  if (journey?.isNext) goal = { key: 'goal', score: 1, label: 'Excellent' };
  else if (journey) goal = { key: 'goal', score: 0.55, label: 'Moderate' };
  else if (ctx.activeJourneys.length) goal = { key: 'goal', score: 0.1, label: 'Low' };
  else goal = { key: 'goal', score: 0.5, label: 'No active goal' };

  // CONTINUITY — where does it sit in the story?
  const sequels = predecessors.filter((p) => p.kind === 'direct_sequel');
  const unreadEarlier = sequels.some((p) => p.state !== 'finished');
  const continuesFinished = sequels.length > 0 && !unreadEarlier;
  let continuity: DimensionScore;
  if (c.state === 'reading') continuity = { key: 'continuity', score: 1, label: 'In progress' };
  else if (journey?.isNext) continuity = { key: 'continuity', score: 1, label: 'Next step' };
  else if (continuesFinished) continuity = { key: 'continuity', score: 0.9, label: 'Direct continuation' };
  else if (unreadEarlier) continuity = { key: 'continuity', score: 0.1, label: 'Earlier book unread' };
  else if (journey) continuity = { key: 'continuity', score: 0.4, label: 'Later step' };
  else continuity = { key: 'continuity', score: 0.5, label: 'Standalone' };

  // TASTE — what they've historically enjoyed: fingerprint closeness plus
  // genre / creator / lane affinity. Characters are judged separately.
  const closeness = fp ? closenessOn(fp, ctx.profile, [...DIMENSIONS]) : 0.5;
  const tagAffinity = avgAffinity([
    ...work.genres.map((g) => ctx.profile.affinities.genre[g]),
    ...work.creators.map((cr) => ctx.profile.affinities.creator[cr]),
    ctx.profile.affinities.bucket[work.bucket],
  ]);
  const tasteScore = tagAffinity === null ? closeness : (closeness + tagAffinity) / 2;
  const taste: DimensionScore = { key: 'taste', score: tasteScore, label: qualityLabel(tasteScore) };

  // MOOD — only meaningful when a mood was chosen.
  let mood: DimensionScore;
  if (!ctx.mood) mood = { key: 'mood', score: 0.5, label: 'No mood set' };
  else {
    const hit = work.genres.some((g) => (MOOD_GENRES[ctx.mood!] ?? []).includes(g)) || work.bucket === ctx.mood;
    mood = { key: 'mood', score: hit ? 1 : 0.3, label: hit ? 'Matches' : 'Off mood' };
  }

  // EXPERIENCE — descriptive; it explains the book but never orders it.
  const experience: DimensionScore = { key: 'experience', score: 0.5, label: experienceOf(work) };

  // CHARACTER — characters only (creators belong to taste).
  const charAff = avgAffinity(work.characters.map((ch) => ctx.profile.affinities.character[ch]));
  const character: DimensionScore = charAff === null
    ? { key: 'character', score: 0.5, label: 'No history yet' }
    : { key: 'character', score: charAff, label: qualityLabel(charAff) };

  // ACCESS — can I read it tonight?
  const access = accessFor(work.own, ctx.travelMode);
  const accessDim: DimensionScore = {
    key: 'access',
    score: access.status === 'available' ? 1 : access.status === 'not_now' ? 0.25 : 0.2,
    label: access.status === 'available' ? access.label : access.status === 'not_now' ? 'Not available now' : 'Not owned',
  };

  // COMMITMENT — shorter is slightly easier to say yes to tonight.
  const raw = fp?.commitment ?? 0.5;
  const commitment: DimensionScore = { key: 'commitment', score: 1 - raw, label: commitmentWord(work) };

  // VARIETY — the same fatigue rule Today uses (variety = 1 - fatigue).
  const last3 = ctx.recentFinished.slice(0, 3);
  let streak = 0;
  if (ctx.recentFinished.length) {
    const bucket = ctx.recentFinished[0].bucket;
    for (const r of ctx.recentFinished) { if (r.bucket !== bucket) break; streak += 1; }
  }
  const varietyScore = 1 - fatiguePenalty(work, last3, streak);
  const variety: DimensionScore = { key: 'variety', score: varietyScore, label: qualityLabel(varietyScore) };

  return [readiness, goal, continuity, taste, mood, experience, character, accessDim, commitment, variety];
}

export const DIMENSION_NAME: Record<DimensionScore['key'], string> = {
  readiness: 'Ready to read', goal: 'Your goal', continuity: 'Story position', taste: 'Taste', mood: 'Mood',
  experience: 'Experience', character: 'Characters', access: 'Access', commitment: 'Commitment', variety: 'Variety',
};
