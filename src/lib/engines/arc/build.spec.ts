import { describe, expect, it } from 'vitest';
import { buildArc, skipAdviceFor } from './build';
import { BATMAN_FAMILY_ARC } from './templates';
import type { ArcDepth, ArcLibrary, ArcLibraryEntry } from './types';
import { CATALOG_EDGES, CATALOG_WORKS, DEV_LIBRARY_ENTRIES } from '../../db/seed/catalog';
import { BATMAN_ARC_EDGES } from '../../db/seed/catalog.batman-arc.edges';

const lib = (entries: Record<string, Partial<ArcLibraryEntry>>): ArcLibrary =>
  new Map(Object.entries(entries).map(([id, e]) => [id, { status: 'none', own: 'none', ...e } as ArcLibraryEntry]));

// Mukund's real shelf, exactly as seeded on his dev device.
const devShelf: ArcLibrary = new Map(DEV_LIBRARY_ENTRIES.map((e) => [e.workId, { status: e.status, own: e.own }]));

const mainWorkIds = (depth: ArcDepth) =>
  buildArc(BATMAN_FAMILY_ARC, depth, new Map()).chapters.flatMap((c) => c.milestones.flatMap((m) => m.items.map((i) => i.workId)));

describe('Batman arc template integrity', () => {
  const allDefs = [
    ...BATMAN_FAMILY_ARC.chapters.flatMap((c) => c.milestones.flatMap((m) => m.items)),
    ...(BATMAN_FAMILY_ARC.endgame?.branches.flatMap((b) => b.items) ?? []),
  ];

  it('references only works that exist in the catalog', () => {
    const ids = new Set(CATALOG_WORKS.map((w) => w.id));
    expect(allDefs.filter((d) => !ids.has(d.workId)).map((d) => d.workId)).toEqual([]);
  });

  it('never lists a work twice anywhere in the arc', () => {
    const seen = allDefs.map((d) => d.workId);
    expect(seen.filter((id, i) => seen.indexOf(id) !== i)).toEqual([]);
  });

  it('keeps possible futures / Elseworlds / alternates out of the main path', () => {
    const mainDefs = BATMAN_FAMILY_ARC.chapters.flatMap((c) => c.milestones.flatMap((m) => m.items));
    expect(mainDefs.filter((d) => ['possible_future', 'elseworld', 'alternate'].includes(d.continuity))).toEqual([]);
  });

  it('gives every item a non-empty why', () => {
    expect(allDefs.filter((d) => !d.why.trim())).toEqual([]);
  });

  it('has unique chapter and milestone ids', () => {
    const ids = BATMAN_FAMILY_ARC.chapters.flatMap((c) => [c.id, ...c.milestones.map((m) => m.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('seeds arc edges that all resolve to catalog works', () => {
    const ids = new Set(CATALOG_WORKS.map((w) => w.id));
    expect(BATMAN_ARC_EDGES.filter((e) => !ids.has(e.fromWork) || !ids.has(e.toWork))).toEqual([]);
    expect(CATALOG_EDGES.filter((e) => e.type === 'possible_future').every((e) => ids.has(e.toWork))).toBe(true);
  });
});

describe('depth levels', () => {
  it('scales ~10-15 / ~20-30 / 25+ books on the main path', () => {
    const counts = (['essential', 'recommended', 'completionist'] as const).map((d) => mainWorkIds(d).length);
    expect(counts[0]).toBeGreaterThanOrEqual(10);
    expect(counts[0]).toBeLessThanOrEqual(15);
    expect(counts[1]).toBeGreaterThanOrEqual(20);
    expect(counts[1]).toBeLessThanOrEqual(30);
    expect(counts[2]).toBeGreaterThanOrEqual(25); // main path only; endgame branches add the rest
  });

  it('is nested: essential ⊂ recommended ⊂ completionist', () => {
    const e = new Set(mainWorkIds('essential'));
    const r = new Set(mainWorkIds('recommended'));
    const c = new Set(mainWorkIds('completionist'));
    expect([...e].every((id) => r.has(id))).toBe(true);
    expect([...r].every((id) => c.has(id))).toBe(true);
  });

  it('drops milestones that have nothing at the chosen depth', () => {
    const plan = buildArc(BATMAN_FAMILY_ARC, 'essential', new Map());
    expect(plan.chapters.flatMap((c) => c.milestones).every((m) => m.items.length > 0)).toBe(true);
    expect(plan.chapters.flatMap((c) => c.milestones).some((m) => m.id === 'ms-jason-becomes-robin')).toBe(false);
  });
});

describe("Mukund's real shelf (the spec's example)", () => {
  const plan = buildArc(BATMAN_FAMILY_ARC, 'recommended', devShelf);

  it('starts him at Dark Victory — not Year One, not Batman and Son', () => {
    expect(plan.nextStep?.workId).toBe('dark-victory');
    expect(plan.nextStep?.milestoneId).toBe('ms-dick-becomes-robin');
    expect(plan.nextStep?.chapterId).toBe('ch-first-robin');
    expect(plan.nextStep?.state).toBe('owned_unread');
    expect(plan.nextStep?.own).toBe('physical');
  });

  it('marks the beginning complete and the first-Robin chapter current', () => {
    expect(plan.chapters[0].status).toBe('complete');
    expect(plan.chapters[1].status).toBe('current');
    expect(plan.chapters[2].status).toBe('upcoming');
    expect(plan.milestonesComplete).toBe(2);
    expect(plan.currentMilestoneId).toBe('ms-dick-becomes-robin');
  });

  it('reports progress by milestones and names the upcoming beat', () => {
    expect(plan.percentComplete).toBe(Math.round((2 / plan.milestonesTotal) * 100));
    expect(plan.upcomingMilestone?.id).toBe('ms-dick-becomes-nightwing');
  });

  it('never recommends a book he has already finished', () => {
    const finished = new Set(['year-one', 'man-who-laughs', 'long-halloween']);
    expect(finished.has(plan.nextStep!.workId)).toBe(false);
    const items = plan.chapters.flatMap((c) => c.milestones.flatMap((m) => m.items));
    expect(items.find((i) => i.workId === 'year-one')?.state).toBe('finished');
  });

  it('reflects ownership per book', () => {
    const items = plan.chapters.flatMap((c) => c.milestones.flatMap((m) => m.items));
    expect(items.find((i) => i.workId === 'robin-year-one')?.state).toBe('not_owned');
    expect(items.find((i) => i.workId === 'killing-joke')?.state).toBe('owned_unread');
    expect(items.find((i) => i.workId === 'under-red-hood')?.state).toBe('owned_unread');
    expect(items.find((i) => i.workId === 'under-red-hood')?.own).toBe('digital');
  });
});

describe('next-step rules', () => {
  it('a brand-new reader starts at Year One', () => {
    const plan = buildArc(BATMAN_FAMILY_ARC, 'recommended', new Map());
    expect(plan.nextStep?.workId).toBe('year-one');
    expect(plan.percentComplete).toBe(0);
  });

  it('finishes a book already being read before opening a new one', () => {
    const plan = buildArc(BATMAN_FAMILY_ARC, 'recommended', lib({
      'year-one': { status: 'done' }, 'man-who-laughs': { status: 'done' }, 'long-halloween': { status: 'done' },
      'dark-victory': { own: 'physical' }, 'robin-year-one': { own: 'digital', status: 'reading' },
    }));
    expect(plan.nextStep?.workId).toBe('robin-year-one');
    expect(plan.nextStep?.state).toBe('reading');
  });

  it('treats a dropped book as resolved so the reader is never stuck', () => {
    const plan = buildArc(BATMAN_FAMILY_ARC, 'essential', lib({
      'year-one': { status: 'done' }, 'man-who-laughs': { status: 'done' }, 'long-halloween': { status: 'done' },
      'dark-victory': { status: 'dropped' },
    }));
    expect(plan.nextStep?.workId).not.toBe('dark-victory');
  });

  it('reaches the endgame choice once every main milestone is done, with no automatic next book', () => {
    const everything = lib(Object.fromEntries(mainWorkIds('completionist').map((id) => [id, { status: 'done' as const, own: 'physical' as const }])));
    const plan = buildArc(BATMAN_FAMILY_ARC, 'completionist', everything);
    expect(plan.atEndgame).toBe(true);
    expect(plan.percentComplete).toBe(100);
    expect(plan.nextStep).toBeNull();
    expect(plan.endgame?.branches.length).toBeGreaterThan(1);
  });

  it('does not let endgame-branch reading affect main progress', () => {
    const base = buildArc(BATMAN_FAMILY_ARC, 'recommended', new Map());
    const withBranch = buildArc(BATMAN_FAMILY_ARC, 'recommended', lib({ 'dark-knight-returns': { status: 'done' } }));
    expect(withBranch.percentComplete).toBe(base.percentComplete);
    expect(withBranch.nextStep?.workId).toBe(base.nextStep?.workId);
  });

  it('labels each endgame branch with its continuity', () => {
    const plan = buildArc(BATMAN_FAMILY_ARC, 'completionist', new Map());
    const dkr = plan.endgame!.branches.flatMap((b) => b.items).find((i) => i.workId === 'dark-knight-returns');
    expect(dkr?.continuity).toBe('possible_future');
    expect(plan.endgame!.branches.every((b) => b.continuityNote.length > 0)).toBe(true);
  });
});

describe('skip advice', () => {
  it("lets you skip Robin: Year One, with the spec's reasoning", () => {
    const def = BATMAN_FAMILY_ARC.chapters[1].milestones[0].items.find((i) => i.workId === 'robin-year-one')!;
    const a = skipAdviceFor(def);
    expect(a.canSkip).toBe(true);
    expect(a.missed).toMatch(/Bruce and Dick/);
  });

  it('will not tell you to skip an essential step', () => {
    const def = BATMAN_FAMILY_ARC.chapters[1].milestones[0].items.find((i) => i.workId === 'dark-victory')!;
    expect(skipAdviceFor(def).canSkip).toBe(false);
  });

  it('gives every tier a non-empty answer', () => {
    for (const tier of ['essential', 'recommended', 'optional', 'deep_cut'] as const) {
      const a = skipAdviceFor({ workId: 'x', tier, continuity: 'main', why: 'w' });
      expect([a.headline, a.impact, a.missed, a.recommendation].every((s) => s.length > 0)).toBe(true);
    }
  });
});

describe('family tree', () => {
  const statusOf = (plan: ReturnType<typeof buildArc>, branch: string, label: string) =>
    plan.family!.branches.find((b) => b.name === branch)!.identities.find((i) => i.label === label)!.status;

  it('fills in as the reader progresses (Mukund: Bruce done, Dick-as-Robin current)', () => {
    const plan = buildArc(BATMAN_FAMILY_ARC, 'recommended', devShelf);
    expect(plan.family?.root).toBe('Bruce Wayne');
    expect(statusOf(plan, 'Dick Grayson', 'Robin')).toBe('current');
    expect(statusOf(plan, 'Dick Grayson', 'Nightwing')).toBe('upcoming');
    expect(statusOf(plan, 'Jason Todd', 'Red Hood')).toBe('upcoming');
    expect(statusOf(plan, 'Damian Wayne', 'Robin')).toBe('upcoming');
  });

  it('marks every identity reached once the whole path is done (Completionist)', () => {
    const everything = lib(Object.fromEntries(mainWorkIds('completionist').map((id) => [id, { status: 'done' as const, own: 'physical' as const }])));
    const plan = buildArc(BATMAN_FAMILY_ARC, 'completionist', everything);
    for (const b of plan.family!.branches) for (const i of b.identities) expect(i.status).toBe('complete');
  });

  it('leaves an identity unreached when its beat is not part of the chosen depth (Red Robin at Recommended)', () => {
    const everything = lib(Object.fromEntries(mainWorkIds('recommended').map((id) => [id, { status: 'done' as const, own: 'physical' as const }])));
    const plan = buildArc(BATMAN_FAMILY_ARC, 'recommended', everything);
    expect(statusOf(plan, 'Tim Drake', 'Robin')).toBe('complete');
    expect(statusOf(plan, 'Tim Drake', 'Red Robin')).toBe('upcoming');
  });

  it('counts a missing milestone as reached when a later identity is (Essential drops Jason-as-Robin)', () => {
    const plan = buildArc(BATMAN_FAMILY_ARC, 'essential', new Map());
    expect(statusOf(plan, 'Jason Todd', 'Robin')).toBe('upcoming');
    const done = lib(Object.fromEntries(mainWorkIds('essential').map((id) => [id, { status: 'done' as const, own: 'physical' as const }])));
    const finished = buildArc(BATMAN_FAMILY_ARC, 'essential', done);
    expect(statusOf(finished, 'Jason Todd', 'Robin')).toBe('complete');
  });

  it('only references milestones that exist in the template', () => {
    const ids = new Set(BATMAN_FAMILY_ARC.chapters.flatMap((c) => c.milestones.map((m) => m.id)));
    const refs = BATMAN_FAMILY_ARC.family!.branches.flatMap((b) => b.identities.map((i) => i.milestoneId));
    expect(refs.filter((r) => !ids.has(r))).toEqual([]);
  });
});
