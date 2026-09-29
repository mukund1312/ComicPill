// "Will I miss anything?" / "Can I skip this?" — jobs #15, #16, #34, #35.
// Turns the story-edge graph into a direct, categorized answer instead of a
// flat "optional" label, which the product research called out explicitly:
// users won't trust an edition/skip recommendation unless the app can
// explain what's actually lost.
import type { StoryEdge } from '../../types/engine-io';

export interface SkipImpact {
  workId: string;
  canSkip: boolean; // false only if something REQUIRED depends on having read this
  mainStoryImpact: 'none' | 'minor' | 'major';
  characterContextImpact: 'none' | 'minor' | 'major';
  futureContinuityImpact: 'none' | 'minor' | 'major';
  completionistOnly: boolean; // true if the only things affected are optional/tie-in edges
  affectedWorkIds: string[]; // works whose reading is impacted by skipping this one
}

/** Looks at every edge FROM this work (what depends on having read it) and
 *  classifies the fallout by the edge strength, not just its type. A
 *  'required' outgoing edge means skipping blocks something outright; a
 *  'tie_in' edge means skipping only costs completionist material. */
export function skipImpact(workId: string, edges: StoryEdge[]): SkipImpact {
  const outgoing = edges.filter((e) => e.fromWork === workId);

  const hasRequired = outgoing.some((e) => e.strength === 'required');
  const hasStrong = outgoing.some((e) => e.strength === 'strongly_recommended');
  const hasUseful = outgoing.some((e) => e.strength === 'useful_context');
  const onlyOptionalOrTieIn = outgoing.length > 0 && outgoing.every(
    (e) => e.strength === 'optional' || e.strength === 'tie_in',
  );

  const impactFor = (relevantTypes: Set<string>): 'none' | 'minor' | 'major' => {
    const relevant = outgoing.filter((e) => relevantTypes.has(e.type));
    if (relevant.some((e) => e.strength === 'required' || e.strength === 'strongly_recommended')) return 'major';
    if (relevant.some((e) => e.strength === 'useful_context')) return 'minor';
    return 'none';
  };

  return {
    workId,
    canSkip: !hasRequired,
    mainStoryImpact: impactFor(new Set(['direct_sequel', 'required_context', 'same_run'])),
    characterContextImpact: impactFor(new Set(['optional_context', 'similar_tone'])),
    futureContinuityImpact: impactFor(new Set(['same_event', 'alternate_universe'])),
    completionistOnly: onlyOptionalOrTieIn && !hasRequired && !hasStrong && !hasUseful,
    affectedWorkIds: [...new Set(outgoing.map((e) => e.toWork))],
  };
}
