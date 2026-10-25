import type { CaptureRow, RelationRow, SeriesInput, SeriesRow, ShotRow } from './model';
import type { Confidence, Importance } from './engine/types';

/** Everything the pipeline needs from storage. The phone implements it with SQLite; tests with a Map. */
export interface MindStore {
  addScreenshots(rows: Array<{ assetId: string; uri: string; takenAt: number }>): number;
  getScreenshot(id: string): ShotRow | null;
  listScreenshots(): ShotRow[];
  updateScreenshot(id: string, patch: Partial<Pick<ShotRow, 'status' | 'gate' | 'gateReason' | 'ocrText' | 'error' | 'summary'>>): void;

  addCapture(c: Omit<CaptureRow, 'id' | 'createdAt'>): string;
  getCapture(id: string): CaptureRow | null;
  updateCapture(id: string, patch: Partial<Pick<CaptureRow, 'status' | 'seriesId' | 'options'>>): void;
  listCaptures(screenshotId: string): CaptureRow[];
  deleteCaptures(screenshotId: string): void;

  getSeries(id: string): SeriesRow | null;
  findSeriesByTitle(title: string): SeriesRow[];
  /** Insert or update. A stub never overwrites a full record; a full record replaces a stub. Returns the id. */
  upsertSeries(s: SeriesInput): string;
  markFound(seriesId: string, at: number): void;

  /** Keeps a "looks wrong" flag already set on the pair. */
  upsertRelation(r: { before: string; after: string; importance: Importance; confidence: Confidence; note?: string | null }): void;
  relationsOf(seriesId: string): RelationRow[];

  getCache(key: string, maxAgeMs: number): string | null;
  setCache(key: string, json: string): void;
}
