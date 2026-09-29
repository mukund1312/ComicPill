// Row <-> domain object mappers. This is the ONLY file that knows both the
// SQLite row shape and the domain/engine types — queries import from here,
// never construct engine objects from raw rows themselves.
import type { works, editions, storyEdges, paths, pathItems, userLibrary, events } from './schema';
import type { Dim, Genre } from '../types/domain';
import type { ScorableWork, StoryEdge, FinishedRead } from '../types/engine-io';
import type { TasteEvent } from '../types/domain';

type WorkRow = typeof works.$inferSelect;
type EditionRow = typeof editions.$inferSelect;
type EdgeRow = typeof storyEdges.$inferSelect;
type PathRow = typeof paths.$inferSelect;
type PathItemRow = typeof pathItems.$inferSelect;
type LibraryRow = typeof userLibrary.$inferSelect;
type EventRow = typeof events.$inferSelect;

export interface WorkContext {
  work: WorkRow;
  /** Every edition of this work (a work can have several — single issue,
   *  TPB, hardcover, omnibus...). See pickRepresentativeEdition() for how
   *  the engine picks one to score against; the detail page shows them all. */
  editions: EditionRow[];
  library: LibraryRow | null;
  bucket: string; // path_key of the path this work's path_item belongs to
}

/** For scoring (O, price value, format verdict) the engine needs ONE
 *  representative edition, not all of them: prefer whichever format the
 *  reader actually owns, else the first one on record. */
export function pickRepresentativeEdition(ctx: WorkContext): EditionRow | null {
  const owned = ctx.library?.own;
  if (owned && owned !== 'none' && owned !== 'both') {
    const match = ctx.editions.find((e) => e.format === owned);
    if (match) return match;
  }
  return ctx.editions[0] ?? null;
}

/** Build the pure ScorableWork the engines consume from the joined row data. */
export function toScorableWork(ctx: WorkContext, requiredParentIds: string[]): ScorableWork {
  const { work, library } = ctx;
  const edition = pickRepresentativeEdition(ctx);
  return {
    id: work.id,
    title: work.title,
    bucket: ctx.bucket,
    universe: work.universe,
    fingerprint: work.fingerprint as Record<Dim, number> | null,
    genres: work.genres as Genre[],
    creators: work.creators,
    characters: work.characters,
    contextNeeded: work.contextNeeded as 'none' | 'helpful' | 'required',
    requiredParentIds,
    own: (library?.own as ScorableWork['own']) ?? 'none',
    keeper: work.keeperFlag,
    pricePaise: edition?.typicalPricePaise ?? null,
    formatVerdict: (edition?.format as ScorableWork['formatVerdict']) ?? 'digital',
  };
}

export function toStoryEdge(row: EdgeRow): StoryEdge {
  return {
    fromWork: row.fromWork, toWork: row.toWork, type: row.type as StoryEdge['type'],
    strength: row.strength as StoryEdge['strength'], confirmed: row.confirmed,
  };
}

export function toFinishedRead(row: LibraryRow, bucket: string, fingerprint: Record<Dim, number> | null): FinishedRead | null {
  if (row.status !== 'done' || row.rating == null || !row.finishedAt) return null;
  return { workId: row.workId, bucket, fingerprint, rating: row.rating as 1 | 2 | 3 | 4 | 5, finishedAt: row.finishedAt };
}

export function toTasteEvent(row: EventRow): TasteEvent {
  return {
    id: row.id,
    workId: row.workId,
    type: row.type as TasteEvent['type'],
    dimension: row.dimension as Dim | null,
    tag: row.tagKind && row.tagValue ? { kind: row.tagKind as any, value: row.tagValue } : null,
    value: row.value,
    calibration: row.calibration as TasteEvent['calibration'],
    appetite: row.appetite as TasteEvent['appetite'],
    exploreGoodOrBetter: row.exploreGoodOrBetter,
    occurredAt: row.occurredAt,
  };
}

export function fromTasteEvent(e: TasteEvent): typeof events.$inferInsert {
  return {
    id: e.id, workId: e.workId, type: e.type, dimension: e.dimension,
    tagKind: e.tag?.kind ?? null, tagValue: e.tag?.value ?? null,
    value: e.value, calibration: e.calibration,
    appetite: e.appetite, exploreGoodOrBetter: e.exploreGoodOrBetter,
    occurredAt: e.occurredAt,
  };
}
