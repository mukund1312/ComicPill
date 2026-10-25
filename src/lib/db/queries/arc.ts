// Query layer for arcs: the only place the arc engine meets SQLite.
// buildArc() itself stays pure — this loads the reader's library into the
// plain Map it wants, and persists their goals.
import { desc, eq } from 'drizzle-orm';
import { db } from '../client';
import { rabbitHoles, userArcs, userLibrary, works } from '../schema';
import { ARC_TEMPLATES } from '../../engines/arc/templates';
import { buildArc } from '../../engines/arc/build';
import { buildMembershipIndex, nextSteps, type ActiveArc, type ArcMembership } from '../../engines/arc/membership';
import { DEFAULT_ARC_DEPTH, type ArcDepth, type ArcLibrary, type ArcPlan } from '../../engines/arc/types';
import type { Own, ReadStatus } from '../../types/domain';
import { newId } from '../../util/id';
import { isSameTopic } from '../../engines/arc/rabbit';
import { findExistingBranch } from '../../engines/arc/branches';
import type { ReaderWork } from '../../engines/arc/characters';

export interface UserArc {
  id: string;
  templateKey: string;
  goalText: string;
  depth: ArcDepth;
  intent: unknown;
  parentArcId: string | null;
  status: 'active' | 'saved' | 'done';
  createdAt: string;
  updatedAt: string;
}

export function loadArcLibrary(): ArcLibrary {
  const rows = db.select().from(userLibrary).all();
  return new Map(rows.map((r) => [r.workId, { status: r.status as ReadStatus, own: r.own as Own }]));
}

function toUserArc(r: typeof userArcs.$inferSelect): UserArc {
  return {
    id: r.id, templateKey: r.templateKey, goalText: r.goalText, depth: r.depth as ArcDepth,
    intent: r.intent ?? null, parentArcId: r.parentArcId, status: r.status as UserArc['status'],
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export function listUserArcs(): UserArc[] {
  return db.select().from(userArcs).orderBy(desc(userArcs.updatedAt)).all().map(toUserArc);
}

export function getUserArc(id: string): UserArc | null {
  const row = db.select().from(userArcs).where(eq(userArcs.id, id)).get();
  return row ? toUserArc(row) : null;
}

export function createUserArc(input: {
  templateKey: string; goalText: string; depth?: ArcDepth; intent?: unknown; parentArcId?: string | null; now: Date;
}): UserArc {
  if (!ARC_TEMPLATES[input.templateKey]) throw new Error(`Unknown arc template: ${input.templateKey}`);
  const now = input.now.toISOString();
  const row = {
    id: newId(), templateKey: input.templateKey, goalText: input.goalText,
    depth: input.depth ?? DEFAULT_ARC_DEPTH, intent: input.intent ?? null,
    parentArcId: input.parentArcId ?? null, status: 'active', createdAt: now, updatedAt: now,
  };
  db.insert(userArcs).values(row).run();
  return toUserArc(row as typeof userArcs.$inferSelect);
}

export function updateUserArc(id: string, patch: Partial<Pick<UserArc, 'goalText' | 'depth' | 'intent' | 'status'>>, now: Date): void {
  db.update(userArcs).set({ ...patch, updatedAt: now.toISOString() }).where(eq(userArcs.id, id)).run();
}

export function deleteUserArc(id: string): void {
  db.delete(userArcs).where(eq(userArcs.id, id)).run();
}

/** The plan for a stored goal, against the reader's live library. */
export function planForUserArc(arc: UserArc): ArcPlan | null {
  const template = ARC_TEMPLATES[arc.templateKey];
  return template ? buildArc(template, arc.depth, loadArcLibrary()) : null;
}

/** Preview a template at a depth without saving a goal (the depth picker). */
export function previewArc(templateKey: string, depth: ArcDepth = DEFAULT_ARC_DEPTH): ArcPlan | null {
  const template = ARC_TEMPLATES[templateKey];
  return template ? buildArc(template, depth, loadArcLibrary()) : null;
}

/** id -> title for the works an arc mentions (a two-column select, not the
 *  full joined contexts loadAllWorkContexts() builds). */
export function loadWorkTitles(): Map<string, string> {
  return new Map(db.select({ id: works.id, title: works.title }).from(works).all().map((w) => [w.id, w.title]));
}

/** Journeys the reader is currently following, most recently used first. */
export function loadActiveArcs(): ActiveArc[] {
  return listUserArcs().filter((a) => a.status === 'active').flatMap((a) => {
    const plan = planForUserArc(a);
    return plan ? [{ id: a.id, plan }] : [];
  });
}

/** workId -> the active journeys it belongs to. */
export function loadMemberships(arcs: ActiveArc[] = loadActiveArcs()): Map<string, ArcMembership[]> {
  return buildMembershipIndex(arcs);
}

export function loadNextSteps(arcs: ActiveArc[] = loadActiveArcs()) {
  return nextSteps(arcs);
}

// ---- rabbit holes -------------------------------------------------------------

export interface RabbitHole { id: string; topic: string; sourceWorkId: string | null; status: 'saved' | 'active' | 'done'; createdAt: string }

export function listRabbitHoles(): RabbitHole[] {
  return db.select().from(rabbitHoles).orderBy(desc(rabbitHoles.createdAt)).all() as RabbitHole[];
}

/** Save a topic for later. Saving the same topic twice is a no-op, and it
 *  never touches any journey the reader is on. */
export function saveRabbitHole(topic: string, sourceWorkId: string | null, now: Date): RabbitHole {
  const clean = topic.replace(/\s+/g, ' ').trim();
  const existing = listRabbitHoles().find((r) => isSameTopic(r.topic, clean));
  if (existing) return existing;
  const row: RabbitHole = { id: newId(), topic: clean, sourceWorkId, status: 'saved', createdAt: now.toISOString() };
  db.insert(rabbitHoles).values(row).run();
  return row;
}

export function removeRabbitHole(id: string): void {
  db.delete(rabbitHoles).where(eq(rabbitHoles.id, id)).run();
}

// ---- reader history, for judging what's familiar --------------------------------

export function loadReaderWorks(): ReaderWork[] {
  const lib = new Map(db.select().from(userLibrary).all().map((l) => [l.workId, l]));
  return db.select({ id: works.id, characters: works.characters }).from(works).all().map((w) => {
    const l = lib.get(w.id);
    const own = (l?.own ?? 'none') as Own;
    return {
      characters: (w.characters ?? []) as string[],
      status: (l?.status ?? 'none') as ReaderWork['status'],
      accessible: own === 'physical' || own === 'digital' || own === 'both' || own === 'subscription',
    };
  });
}

/** Title of the very next book in the reader's most recent journey, if any
 *  (used to make the daily reminder say something useful). */
export function nextJourneyTitle(): string | null {
  const step = loadNextSteps()[0];
  return step ? loadWorkTitles().get(step.workId) ?? null : null;
}

// ---- branches -----------------------------------------------------------------

export function branchesOf(parentId: string): UserArc[] {
  return listUserArcs().filter((a) => a.parentArcId === parentId);
}

/** Start (or reopen) a side journey from a milestone. The same branch is never
 *  created twice for one parent, and the parent journey is left untouched. */
export function startBranch(parentId: string, templateKey: string, now: Date): UserArc {
  const existing = findExistingBranch(listUserArcs(), parentId, templateKey);
  if (existing) return existing;
  const template = ARC_TEMPLATES[templateKey];
  if (!template) throw new Error(`Unknown arc template: ${templateKey}`);
  return createUserArc({
    templateKey, goalText: template.goal, depth: getUserArc(parentId)?.depth ?? DEFAULT_ARC_DEPTH, parentArcId: parentId, now,
  });
}
