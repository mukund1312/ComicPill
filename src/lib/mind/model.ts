import type { Gate } from './capture/ocrFilter';
import type { ExternalSeries, Medium, Source } from './remote/types';
import type { Importance, Confidence, ReadStatus } from './engine/types';
import type { Tags } from './engine/tasteScorer';
import type { PrintStatus, RunStatus } from './engine/verdictRules';

export type ShotStatus = 'new' | 'skipped' | 'sensitive' | 'awaiting_approval' | 'queued' | 'processing' | 'ready' | 'needs_review' | 'error';

export type ShotRow = {
  id: string; assetId: string; uri: string; takenAt: number; addedAt: number;
  status: ShotStatus; gate: Gate | null; gateReason: string | null;
  /** OCR text, kept only for screenshots that looked comic-related. */
  ocrText: string | null; error: string | null; summary: string | null;
};

export type CaptureStatus = 'matched' | 'needs_choice' | 'needs_review' | 'unmatched' | 'dismissed';
export type MatchOption = { series: ExternalSeries; score: number };

export type CaptureRow = {
  id: string; screenshotId: string; title: string; titleConf: string; creators: string[]; medium: Medium;
  status: CaptureStatus; seriesId: string | null; options: MatchOption[] | null; createdAt: number;
};

export type SeriesRow = {
  id: string; source: Source; externalId: string; title: string; medium: Medium; year: number | null;
  runStatus: RunStatus; units: number; unitName: 'volumes' | 'issues';
  tags: Tags; creators: string[]; description: string; coverUrl: string | null; publisher: string | null;
  artDriven: boolean; printStatus: PrintStatus; priceRising: boolean;
  /** Came from a database (or the local catalog), not just the AI's reading. */
  verified: boolean;
  /** A title known only from someone else's relation list — no details yet. */
  stub: boolean;
  /** The AI has tagged it (one call per series, ever). */
  judged: boolean;
  readStatus: ReadStatus; createdAt: number; foundAt: number | null;
};

export type SeriesInput = Omit<SeriesRow, 'createdAt' | 'readStatus' | 'foundAt'>;

export type RelationRow = { before: string; after: string; importance: Importance; confidence: Confidence; note: string | null; wrong: boolean };

export const seriesId = (source: Source, externalId: string) => `${source}:${externalId}`;
