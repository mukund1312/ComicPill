// Everything a comic detail / "cover page" screen needs, assembled from the
// db layer as plain objects — editions to compare, where this work sits in
// its reading path (previous/next), and related works via the story graph.
import { eq } from 'drizzle-orm';
import { db } from '../client';
import { paths, pathItems, storyEdges, workIssues, issues, series } from '../schema';
import { loadAllWorkContexts, loadAllEdges } from './library';
import { expandPath } from '../../engines/graph/path';
import { skipImpact, type SkipImpact } from '../../engines/graph/skip';
import { estimateSeriesCommitment, type SeriesCommitment, type SeriesVolume } from '../../engines/purchase/commitment';
import { pickRepresentativeEdition } from '../map';
import { isAccessible } from '../../util/own';
import type { ContextLevel, EdgeType, PrintingType, SeriesStatus, Own } from '../../types/domain';

export interface DetailEdition {
  id: string;
  printing: PrintingType;
  format: 'physical' | 'digital';
  isbn13: string | null;
  diamondCode: string | null;
  pages: number | null;
  typicalPricePaise: number | null;
  releaseDate: string | null;
  formatNote: string | null;
}

export interface DetailIssue {
  id: string;
  seriesName: string;
  issueNumber: string;
  title: string | null;
  coverDate: string | null;
}

export interface RelatedWork {
  workId: string;
  title: string;
  edgeType: EdgeType;
  direction: 'before' | 'after'; // this work is the 'toWork' (before) or 'fromWork' (after) side
  confirmed: boolean;
}

export interface ComicDetail {
  workId: string;
  title: string;
  summary: string | null;
  publisher: string | null;
  universe: string;
  keeper: boolean;
  genres: string[];
  creators: string[];
  characters: string[];
  bucket: string;
  pathName: string | null;
  positionInPath: number | null; // 1-based
  totalInPath: number | null;
  previousInPath: { workId: string; title: string } | null;
  nextInPath: { workId: string; title: string } | null;
  editions: DetailEdition[];
  issues: DetailIssue[]; // empty until real series/issue data is imported (e.g. from GCD)
  related: RelatedWork[];
  // "Can I skip this?" (jobs #15/#16/#34/#35) — null only if there are no
  // story edges at all touching this work (nothing to assess).
  skip: SkipImpact;
  // "How much left to finish this?" (job #19) — null when this work isn't
  // part of a tracked series (primarySeriesId unset).
  seriesCommitment: SeriesCommitment | null;
}

export function loadComicDetail(workId: string, contextLevel: ContextLevel = 'recommended'): ComicDetail | null {
  const contexts = loadAllWorkContexts();
  const ctx = contexts.find((c) => c.work.id === workId);
  if (!ctx) return null;

  const titleById = new Map(contexts.map((c) => [c.work.id, c.work.title]));

  // Where this work sits in its path, expanded to the requested context level.
  const pathItemRow = db.select().from(pathItems).where(eq(pathItems.workId, workId)).get();
  let pathName: string | null = null;
  let positionInPath: number | null = null;
  let totalInPath: number | null = null;
  let previousInPath: ComicDetail['previousInPath'] = null;
  let nextInPath: ComicDetail['nextInPath'] = null;

  if (pathItemRow) {
    const pathRow = db.select().from(paths).where(eq(paths.id, pathItemRow.pathId)).get();
    const seedItems = db.select().from(pathItems).where(eq(pathItems.pathId, pathItemRow.pathId)).all()
      .sort((a, b) => a.position - b.position)
      .map((pi) => pi.workId);
    const edges = loadAllEdges();
    const expanded = expandPath(seedItems, edges, contextLevel);
    const idx = expanded.findIndex((item) => item.workId === workId);

    pathName = pathRow?.name ?? null;
    totalInPath = expanded.length || null;
    positionInPath = idx >= 0 ? idx + 1 : null;
    if (idx > 0) {
      const prev = expanded[idx - 1];
      previousInPath = { workId: prev.workId, title: titleById.get(prev.workId) ?? prev.workId };
    }
    if (idx >= 0 && idx < expanded.length - 1) {
      const next = expanded[idx + 1];
      nextInPath = { workId: next.workId, title: titleById.get(next.workId) ?? next.workId };
    }
  }

  const editions: DetailEdition[] = ctx.editions.map((e) => ({
    id: e.id, printing: e.printing as PrintingType, format: e.format as 'physical' | 'digital',
    isbn13: e.isbn13, diamondCode: e.diamondCode, pages: e.pages,
    typicalPricePaise: e.typicalPricePaise, releaseDate: e.releaseDate, formatNote: e.formatNote,
  }));

  // Issue-level detail — populated once real series/issue data is imported
  // (see docs on the GCD bulk-dump path); empty is the honest state for now.
  const workIssueRows = db.select().from(workIssues).where(eq(workIssues.workId, workId)).all()
    .sort((a, b) => a.position - b.position);
  const detailIssues: DetailIssue[] = workIssueRows.map((wi) => {
    const issue = db.select().from(issues).where(eq(issues.id, wi.issueId)).get();
    const seriesRow = issue ? db.select().from(series).where(eq(series.id, issue.seriesId)).get() : null;
    return issue ? {
      id: issue.id, seriesName: seriesRow?.name ?? 'Unknown series',
      issueNumber: issue.issueNumber, title: issue.title, coverDate: issue.coverDate,
    } : null;
  }).filter((x): x is DetailIssue => x !== null);

  const allEdges = db.select().from(storyEdges).all();

  const skip = skipImpact(workId, loadAllEdges());

  let seriesCommitment: ComicDetail['seriesCommitment'] = null;
  if (ctx.work.primarySeriesId) {
    const seriesRow = db.select().from(series).where(eq(series.id, ctx.work.primarySeriesId)).get();
    if (seriesRow) {
      const volumes: SeriesVolume[] = contexts
        .filter((c) => c.work.primarySeriesId === ctx.work.primarySeriesId)
        .map((c) => ({
          workId: c.work.id,
          ownedOrRead: c.library?.status === 'done' || isAccessible((c.library?.own ?? 'none') as Own),
          typicalPricePaise: pickRepresentativeEdition(c)?.typicalPricePaise ?? null,
        }));
      seriesCommitment = estimateSeriesCommitment(
        volumes,
        seriesRow.status as SeriesStatus,
        seriesRow.plannedVolumeCount,
      );
    }
  }

  const related: RelatedWork[] = [
    ...allEdges.filter((e) => e.toWork === workId).map((e) => ({
      workId: e.fromWork, title: titleById.get(e.fromWork) ?? e.fromWork,
      edgeType: e.type as EdgeType, direction: 'before' as const, confirmed: e.confirmed,
    })),
    ...allEdges.filter((e) => e.fromWork === workId).map((e) => ({
      workId: e.toWork, title: titleById.get(e.toWork) ?? e.toWork,
      edgeType: e.type as EdgeType, direction: 'after' as const, confirmed: e.confirmed,
    })),
  ];

  return {
    workId, title: ctx.work.title, summary: ctx.work.summary, publisher: ctx.work.publisher,
    universe: ctx.work.universe, keeper: ctx.work.keeperFlag, genres: ctx.work.genres,
    creators: ctx.work.creators, characters: ctx.work.characters, bucket: ctx.bucket,
    pathName, positionInPath, totalInPath, previousInPath, nextInPath,
    editions, issues: detailIssues, related, skip, seriesCommitment,
  };
}
