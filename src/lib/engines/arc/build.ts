// buildArc: template + depth + what the reader already owns/has read ->
// a personal plan. Pure — no db, no clock, no randomness — so "what should I
// read next in my Batman journey" is testable without a device.
import { isAccessible } from '../../util/own';
import {
  DEPTH_TIERS,
  type ArcBranch, type ArcChapter, type ArcFamily, type ArcDepth, type ArcEndgame, type ArcItem, type ArcItemDef,
  type ArcItemState, type ArcLibrary, type ArcMilestone, type ArcNextStep, type ArcPlan,
  type ArcProgressStatus, type ArcTemplate, type SkipAdvice,
} from './types';

export function itemState(workId: string, lib: ArcLibrary): { state: ArcItemState; own: ArcItem['own'] } {
  const entry = lib.get(workId);
  const own = entry?.own ?? 'none';
  const status = entry?.status ?? 'none';
  if (status === 'done') return { state: 'finished', own };
  if (status === 'dropped') return { state: 'dropped', own };
  if (status === 'reading') return { state: 'reading', own };
  return { state: isAccessible(own) ? 'owned_unread' : 'not_owned', own };
}

const resolved = (i: ArcItem) => i.state === 'finished' || i.state === 'dropped';

function toItem(def: ArcItemDef, lib: ArcLibrary): ArcItem {
  return { ...def, ...itemState(def.workId, lib) };
}

/** A work may appear once on the main path — a book that spans two beats
 *  belongs to the first, so progress never double-counts it. */
function dedupe(defs: ArcItemDef[], seen: Set<string>): ArcItemDef[] {
  return defs.filter((d) => (seen.has(d.workId) ? false : (seen.add(d.workId), true)));
}

export function buildArc(template: ArcTemplate, depth: ArcDepth, lib: ArcLibrary): ArcPlan {
  const allowed = new Set(DEPTH_TIERS[depth]);
  const seen = new Set<string>();

  // 1. Filter by depth. A milestone/chapter left with nothing at this depth
  //    disappears rather than showing an empty beat.
  const chapters = template.chapters
    .map((ch) => ({
      ch,
      milestones: ch.milestones
        .map((m) => ({ m, items: dedupe(m.items.filter((i) => allowed.has(i.tier)), seen).map((d) => toItem(d, lib)) }))
        .filter((x) => x.items.length > 0),
    }))
    .filter((x) => x.milestones.length > 0);

  // 2. Progress: the first unresolved milestone is "current"; everything
  //    before it is complete, everything after it is upcoming.
  let currentFound = false;
  let currentMilestoneId: string | null = null;
  let milestonesComplete = 0;
  let milestonesTotal = 0;
  const flatMilestones: { chapterId: string; chapterTitle: string; milestone: ArcMilestone }[] = [];

  const builtChapters: ArcChapter[] = chapters.map(({ ch, milestones }) => {
    const built: ArcMilestone[] = milestones.map(({ m, items }) => {
      milestonesTotal += 1;
      const done = items.every(resolved);
      let status: ArcProgressStatus;
      if (done && !currentFound) { status = 'complete'; milestonesComplete += 1; }
      else if (!currentFound) { status = 'current'; currentFound = true; currentMilestoneId = m.id; }
      else status = 'upcoming';
      const milestone: ArcMilestone = { id: m.id, title: m.title, change: m.change, character: m.character, status, items };
      flatMilestones.push({ chapterId: ch.id, chapterTitle: ch.title, milestone });
      return milestone;
    });
    const all = built.flatMap((m) => m.items);
    const chStatus: ArcProgressStatus = built.every((m) => m.status === 'complete') ? 'complete'
      : built.some((m) => m.status === 'current') ? 'current' : 'upcoming';
    return {
      id: ch.id, title: ch.title, tagline: ch.tagline, status: chStatus, milestones: built,
      finishedItems: all.filter(resolved).length, totalItems: all.length,
    };
  });

  // 3. Next step: finish a book you've started before opening a new one.
  let nextStep: ArcNextStep | null = null;
  let upcomingMilestone: ArcPlan['upcomingMilestone'] = null;
  const curIdx = flatMilestones.findIndex((f) => f.milestone.id === currentMilestoneId);
  if (curIdx >= 0) {
    const cur = flatMilestones[curIdx];
    const open = cur.milestone.items.filter((i) => !resolved(i));
    const pick = open.find((i) => i.state === 'reading') ?? open[0];
    if (pick) {
      nextStep = {
        workId: pick.workId, state: pick.state, own: pick.own, tier: pick.tier, why: pick.why,
        milestoneId: cur.milestone.id, milestoneTitle: cur.milestone.title,
        chapterId: cur.chapterId, chapterTitle: cur.chapterTitle,
      };
    }
    const after = flatMilestones[curIdx + 1];
    if (after) upcomingMilestone = { id: after.milestone.id, title: after.milestone.title, change: after.milestone.change };
  }

  // 4. Endgame branches: shown as a choice, never counted or auto-recommended.
  let endgame: ArcEndgame | null = null;
  if (template.endgame) {
    const branches: ArcBranch[] = template.endgame.branches
      .map((b) => ({
        id: b.id, label: b.label, description: b.description, continuityNote: b.continuityNote,
        items: b.items.filter((i) => allowed.has(i.tier)).map((d) => toItem(d, lib)),
      }))
      .filter((b) => b.items.length > 0);
    if (branches.length) {
      endgame = { id: template.endgame.id, title: template.endgame.title, tagline: template.endgame.tagline, question: template.endgame.question, branches };
    }
  }

  const branchOffers = (template.branches ?? []).flatMap((b) => {
    const at = flatMilestones.find((f) => f.milestone.id === b.milestoneId);
    return at ? [{ ...b, status: at.milestone.status }] : []; // a milestone hidden at this depth offers nothing
  });

  const family = template.family ? buildFamily(template.family, flatMilestones.map((f) => f.milestone)) : null;

  return {
    key: template.key, title: template.title, goal: template.goal, depth,
    chapters: builtChapters, endgame, family, branchOffers,
    milestonesComplete, milestonesTotal,
    percentComplete: milestonesTotal ? Math.round((milestonesComplete / milestonesTotal) * 100) : 0,
    currentMilestoneId, upcomingMilestone, nextStep,
    atEndgame: milestonesTotal > 0 && milestonesComplete === milestonesTotal,
  };
}

/** An identity takes its milestone's status. If that milestone isn't in the
 *  plan at this depth (e.g. Essential drops "Jason becomes Robin"), it counts
 *  as reached once any LATER identity in the same branch is — you cannot have
 *  been Red Hood without having been Robin. */
function buildFamily(def: NonNullable<ArcTemplate['family']>, milestones: ArcMilestone[]): ArcFamily {
  const statusById = new Map(milestones.map((m) => [m.id, m.status]));
  return {
    root: def.root,
    branches: def.branches.map((b) => ({
      name: b.name,
      identities: b.identities.map((id, i) => {
        const own = statusById.get(id.milestoneId);
        if (own) return { label: id.label, status: own };
        const laterReached = b.identities.slice(i + 1).some((l) => statusById.get(l.milestoneId) === 'complete');
        return { label: id.label, status: laterReached ? 'complete' as const : 'upcoming' as const };
      }),
    })),
  };
}

/** "Can I skip this?" — the item's own note wins; otherwise the tier decides. */
export function skipAdviceFor(item: ArcItemDef): SkipAdvice {
  if (item.skip) {
    return {
      workId: item.workId, canSkip: item.tier !== 'essential',
      headline: item.tier === 'essential' ? 'Not really.' : 'Yes.',
      impact: item.skip.impact, missed: item.skip.missed, recommendation: item.skip.recommendation,
    };
  }
  switch (item.tier) {
    case 'essential':
      return {
        workId: item.workId, canSkip: false, headline: 'Not really.',
        impact: 'This is a load-bearing step in the journey you asked for.',
        missed: 'The next beats will land with less weight.',
        recommendation: 'Read it — it is part of the core story.',
      };
    case 'recommended':
      return {
        workId: item.workId, canSkip: true, headline: 'Yes, but you will feel it.',
        impact: 'You will still follow the overall story.',
        missed: 'Some character development that later books lean on.',
        recommendation: 'Read it if you have the time; skip it if you want the shortest route.',
      };
    case 'optional':
      return {
        workId: item.workId, canSkip: true, headline: 'Yes.',
        impact: 'You will still understand the overall story.',
        missed: 'Extra context that is not required for your goal.',
        recommendation: 'Read it if this character becomes a favourite.',
      };
    case 'deep_cut':
      return {
        workId: item.workId, canSkip: true, headline: 'Yes, easily.',
        impact: 'Nothing in the main journey depends on it.',
        missed: 'A deeper dive for completionists.',
        recommendation: 'Save it for later.',
      };
  }
}
