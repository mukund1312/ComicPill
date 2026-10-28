// One shelf scan as the reader sees it: a result per detected book, each tied to its place in the photo by a stable id (never by position),
// each correctable, and importable on its own so one failure never spoils the rest. Pure, so the rules are tested.
import { decide, type Candidate, type MatchDecision, type MatchStrength } from './candidates';
import type { ManualComic } from './manual';

export type Box = { x: number; y: number; w: number; h: number };
export type ScanStatus = 'matched' | 'needs_review' | 'unmatched' | 'manually_verified' | 'excluded';
export type Ownership = 'physical' | 'digital';
export type ReadingState = 'unread' | 'reading' | 'completed';
export type ImportState = 'pending' | 'imported' | 'updated' | 'skipped' | 'failed';

/** What a result is attached to: a comic the catalog already has, or one the reader described by hand. */
export type Selection = { kind: 'catalog'; workId: string; title: string } | { kind: 'custom'; comic: ManualComic };

export type ScanItem = {
  scanId: string;
  /** Where this book is in the shelf photo (fractions of the photo). */
  box: Box;
  /** A picture of the spine, for checking the match. Never used as a cover. */
  cropUri: string | null;
  extractedText: string[];
  read: { title: string; volume: string | null; creators: string[] };
  candidates: Candidate[];
  strength: MatchStrength;
  editionUncertain: boolean;
  selected: Selection | null;
  status: ScanStatus;
  /** A cover the reader chose for their copy; applied to their library entry on import. */
  customCoverUri: string | null;
  ownership: Ownership;
  reading: ReadingState;
  /** Already in the reader's library: skip it, or update the entry they have. */
  onDuplicate: 'skip' | 'update';
  importState: ImportState;
  error: string | null;
};

export type Detected = { scanId: string; box: Box; cropUri: string | null; extractedText: string[]; read: ScanItem['read']; candidates: Candidate[]; decision: MatchDecision };

/** Start a result from what was read. Confident matches are ready to import; everything else waits for the reader. */
export function itemFromDetected(d: Detected, defaults: { ownership: Ownership; reading: ReadingState }): ScanItem {
  const confident = !!d.decision.best && (d.decision.strength === 'strong' || d.decision.strength === 'likely') && !d.decision.editionUncertain;
  return {
    scanId: d.scanId, box: d.box, cropUri: d.cropUri, extractedText: d.extractedText, read: d.read, candidates: d.candidates,
    strength: d.decision.strength, editionUncertain: d.decision.editionUncertain,
    selected: confident && d.decision.best ? { kind: 'catalog', workId: d.decision.best.id, title: d.decision.best.title } : null,
    status: confident ? 'matched' : d.decision.best ? 'needs_review' : 'unmatched',
    customCoverUri: null, ownership: defaults.ownership, reading: defaults.reading, onDuplicate: 'skip', importState: 'pending', error: null,
  };
}

export const replace = (items: ScanItem[], scanId: string, patch: Partial<ScanItem>): ScanItem[] => items.map((i) => (i.scanId === scanId ? { ...i, ...patch } : i));

/** The reader picked the right comic (from the candidates, a search, or by describing it). The cover and the status follow; the spine photo stays as it was. */
export function chooseMatch(items: ScanItem[], scanId: string, selection: Selection): ScanItem[] {
  return replace(items, scanId, { selected: selection, status: 'manually_verified', editionUncertain: false, error: null, importState: 'pending' });
}
export const excludeItem = (items: ScanItem[], scanId: string, excluded: boolean): ScanItem[] =>
  items.map((i) => (i.scanId !== scanId ? i : { ...i, status: excluded ? 'excluded' : i.selected ? (i.strength === 'strong' || i.strength === 'likely' ? 'matched' : 'manually_verified') : i.candidates.length ? 'needs_review' : 'unmatched' }));

/** One tap for everything the scanner was confident about; the uncertain ones are left for the reader. */
export const confirmAllMatched = (items: ScanItem[]): ScanItem[] => items.map((i) => (i.status === 'matched' && i.selected ? { ...i, status: 'manually_verified' } : i));

export const isReady = (i: ScanItem): boolean => !!i.selected && (i.status === 'matched' || i.status === 'manually_verified') && i.importState !== 'imported' && i.importState !== 'updated';
export const needsAttention = (i: ScanItem): boolean => i.status === 'needs_review' || i.status === 'unmatched' || (i.status === 'matched' && i.editionUncertain);

export function summarize(items: ScanItem[]): { total: number; ready: number; needsAttention: number; excluded: number; imported: number; failed: number; skipped: number } {
  return {
    total: items.length, ready: items.filter(isReady).length, needsAttention: items.filter((i) => i.status !== 'excluded' && needsAttention(i)).length, excluded: items.filter((i) => i.status === 'excluded').length,
    imported: items.filter((i) => i.importState === 'imported' || i.importState === 'updated').length, failed: items.filter((i) => i.importState === 'failed').length, skipped: items.filter((i) => i.importState === 'skipped').length,
  };
}

/** Two results that point at the same catalog comic in one scan are one book twice (a duplicate detection, or two copies): keep the first and tell the reader. */
export function duplicateWithinScan(items: ScanItem[]): Set<string> {
  const seen = new Set<string>(); const dupes = new Set<string>();
  for (const i of items) {
    if (!isReady(i) || i.selected?.kind !== 'catalog') continue;
    if (seen.has(i.selected.workId)) dupes.add(i.scanId); else seen.add(i.selected.workId);
  }
  return dupes;
}

export type ImportDeps = {
  /** Owned already (physical, digital or both) in the reader's library? */
  alreadyOwned: (workId: string) => boolean;
  /** Create the catalog entry for a comic the reader described by hand. */
  createCustom: (comic: ManualComic) => string;
  /** Put the comic in the library with these settings. `update` means it was already there. */
  save: (workId: string, o: { ownership: Ownership; reading: ReadingState; update: boolean }) => void;
  setCover: (workId: string, uri: string) => Promise<void>;
};

/**
 * Import the ready results one by one. Each result is its own unit: one that fails is marked failed with its reason and the rest carry on, and
 * results that were already imported are left alone, so running it again (a retry) only does the unfinished ones.
 */
export async function importItems(items: ScanItem[], deps: ImportDeps): Promise<ScanItem[]> {
  const dupes = duplicateWithinScan(items);
  const out: ScanItem[] = [];
  for (const item of items) {
    if (!isReady(item) && item.importState !== 'failed') { out.push(item); continue; }
    if (item.importState === 'failed' && !item.selected) { out.push(item); continue; }
    if (dupes.has(item.scanId)) { out.push({ ...item, importState: 'skipped', error: null }); continue; }
    try {
      const sel = item.selected!;
      const workId = sel.kind === 'catalog' ? sel.workId : deps.createCustom(sel.comic);
      const owned = sel.kind === 'catalog' && deps.alreadyOwned(workId);
      if (owned && item.onDuplicate === 'skip') { out.push({ ...item, importState: 'skipped', error: null }); continue; }
      deps.save(workId, { ownership: item.ownership, reading: item.reading, update: owned });
      if (item.customCoverUri) await deps.setCover(workId, item.customCoverUri);
      // After a custom comic is created, later retries must not create it again.
      out.push({ ...item, selected: sel.kind === 'custom' ? { kind: 'catalog', workId, title: sel.comic.title } : sel, importState: owned ? 'updated' : 'imported', error: null });
    } catch (e) {
      out.push({ ...item, importState: 'failed', error: e instanceof Error ? e.message.slice(0, 140) : 'Could not add this comic.' });
    }
  }
  return out;
}
