// Where a single book sits in the reader's active journeys, and what the
// journey implies about getting it. This is the seam that lets Today,
// Compare, Discover and the comic page all say "this is your next step"
// without each re-deriving it from chapters and milestones.
import { isAccessible } from '../../util/own';
import type { ArcItem, ArcItemState, ArcPlan, ArcTier } from './types';

export interface ArcMembership {
  arcId: string;
  arcTitle: string;
  workId: string;
  chapterId: string;
  chapterTitle: string;
  milestoneId: string;
  milestoneTitle: string;
  tier: ArcTier;
  state: ArcItemState;
  /** The very next thing to read in this journey. */
  isNext: boolean;
  /** The book just before this one in the journey, for "recommended after X". */
  previousWorkId: string | null;
  percentComplete: number;
}

export interface ActiveArc { id: string; plan: ArcPlan }

const resolved = (s: ArcItemState) => s === 'finished' || s === 'dropped';

/** Every main-path item of a plan, in reading order, with its location. */
function flatten(plan: ArcPlan) {
  return plan.chapters.flatMap((c) => c.milestones.flatMap((m) => m.items.map((item) => ({ c, m, item }))));
}

/** workId -> the journeys it appears in. Endgame-branch books are omitted on
 *  purpose: they are alternatives the reader chooses between, not steps, so
 *  they must never be presented as "your next step". */
export function buildMembershipIndex(arcs: ActiveArc[]): Map<string, ArcMembership[]> {
  const index = new Map<string, ArcMembership[]>();
  for (const arc of arcs) {
    const flat = flatten(arc.plan);
    flat.forEach(({ c, m, item }, i) => {
      const entry: ArcMembership = {
        arcId: arc.id, arcTitle: arc.plan.title, workId: item.workId,
        chapterId: c.id, chapterTitle: c.title, milestoneId: m.id, milestoneTitle: m.title,
        tier: item.tier, state: item.state,
        isNext: arc.plan.nextStep?.workId === item.workId,
        previousWorkId: i > 0 ? flat[i - 1].item.workId : null,
        percentComplete: arc.plan.percentComplete,
      };
      const list = index.get(item.workId) ?? [];
      list.push(entry);
      index.set(item.workId, list);
    });
  }
  return index;
}

/** The membership worth showing: a journey where this is the next step wins,
 *  then any journey where it is still unread; input order breaks ties (callers
 *  pass most-recently-used first). */
export function primaryMembership(list: ArcMembership[] | undefined): ArcMembership | null {
  if (!list?.length) return null;
  return list.find((m) => m.isNext) ?? list.find((m) => !resolved(m.state)) ?? list[0];
}

/** The next step of each journey, for features that just need "what's next". */
export function nextSteps(arcs: ActiveArc[]): { arcId: string; arcTitle: string; workId: string; own: ArcItem['own']; accessible: boolean; chapterTitle: string; milestoneTitle: string; why: string; percentComplete: number }[] {
  return arcs.flatMap(({ id, plan }) => plan.nextStep ? [{
    arcId: id, arcTitle: plan.title, workId: plan.nextStep.workId, own: plan.nextStep.own,
    accessible: isAccessible(plan.nextStep.own), chapterTitle: plan.nextStep.chapterTitle,
    milestoneTitle: plan.nextStep.milestoneTitle, why: plan.nextStep.why, percentComplete: plan.percentComplete,
  }] : []);
}

// ---- getting the book -------------------------------------------------------

export type ReadGuidance =
  | { kind: 'in_hand' }
  | { kind: 'done' }
  /** Not owned, but there is unread material the reader already has that comes first. */
  | { kind: 'wait'; becauseWorkId: string }
  /** Not owned, nothing owned stands in the way: worth a real buy/save/skip decision. */
  | { kind: 'consider_buying' }
  | { kind: 'not_in_journey' };

/** Should the reader go and get this book yet? Reading path informs buying:
 *  if they still have an owned, unread book earlier in the journey, buying a
 *  later one is premature — say WAIT and name the book they already have.
 *  A book that is already accessible or finished needs no purchase advice. */
export function readGuidance(plan: ArcPlan, workId: string): ReadGuidance {
  const flat = flatten(plan);
  const idx = flat.findIndex((f) => f.item.workId === workId);
  if (idx < 0) {
    // Endgame-branch book: it comes after the whole main path.
    const inBranch = plan.endgame?.branches.some((b) => b.items.some((i) => i.workId === workId));
    if (!inBranch) return { kind: 'not_in_journey' };
    const branchItem = plan.endgame!.branches.flatMap((b) => b.items).find((i) => i.workId === workId)!;
    if (branchItem.state === 'finished' || branchItem.state === 'dropped') return { kind: 'done' };
    if (isAccessible(branchItem.own)) return { kind: 'in_hand' };
    const blocker = flat.find((f) => !resolved(f.item.state) && isAccessible(f.item.own));
    return blocker ? { kind: 'wait', becauseWorkId: blocker.item.workId } : { kind: 'consider_buying' };
  }
  const { item } = flat[idx];
  if (item.state === 'finished' || item.state === 'dropped') return { kind: 'done' };
  if (item.state === 'reading' || item.state === 'owned_unread') return { kind: 'in_hand' };
  const blocker = flat.slice(0, idx).find((f) => !resolved(f.item.state) && isAccessible(f.item.own));
  return blocker ? { kind: 'wait', becauseWorkId: blocker.item.workId } : { kind: 'consider_buying' };
}
