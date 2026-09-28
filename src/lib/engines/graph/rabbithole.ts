import type { ScorableWork, StoryEdge, TasteProfile } from '../../types/engine-io';
import { tasteFit } from '../taste/fit';

const FORWARD_TYPES = new Set(['direct_sequel', 'same_run']);

/** Walk forward up to 6 steps, preferring the highest taste fit at each hop,
 *  never revisiting a work. Robust to cycles in story_edges. */
export function rabbitHole(
  from: string,
  edges: StoryEdge[],
  works: Map<string, ScorableWork>,
  profile: TasteProfile,
  maxSteps = 6,
): string[] {
  const path: string[] = [];
  const visited = new Set<string>([from]);
  let current = from;

  for (let step = 0; step < maxSteps; step++) {
    const candidates = edges
      .filter((e) => e.fromWork === current && FORWARD_TYPES.has(e.type) && !visited.has(e.toWork))
      .map((e) => works.get(e.toWork))
      .filter((w): w is ScorableWork => !!w);

    if (!candidates.length) break;
    candidates.sort((a, b) => tasteFit(b, profile) - tasteFit(a, profile));
    const next = candidates[0];
    path.push(next.id);
    visited.add(next.id);
    current = next.id;
  }
  return path;
}
