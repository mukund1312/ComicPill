import type { Confidence, Importance } from '../engine/types';

export type Medium = 'manga' | 'comic' | 'graphic_novel' | 'unknown';
export type Source = 'anilist' | 'comicvine' | 'local' | 'ai';

/** A relation as the database states it, before it is normalised into "read A before B". */
export type ExternalRelation = {
  /** What the *target* is, relative to this series. */
  kind: 'prequel' | 'sequel' | 'parent' | 'side_story' | 'spin_off' | 'other';
  externalId: string;
  title: string;
  year?: number;
  units: number;
  status: 'finished' | 'ongoing' | 'unknown';
  /** A source that already weighs its relations (the local catalog) says so; otherwise the default for `kind` applies. */
  importance?: Importance;
  confidence?: Confidence;
  /** When the source states the order outright (the catalog does): does the target come before or after this series? */
  direction?: 'before' | 'after';
};

export type ExternalSeries = {
  source: Source;
  externalId: string;
  title: string;
  altTitles: string[];
  medium: Medium;
  year?: number;
  status: 'finished' | 'ongoing' | 'unknown';
  /** Volumes (manga) or issues (US comics); 0 if the database doesn't say. */
  units: number;
  unitName: 'volumes' | 'issues';
  genres: string[];
  tags: string[];
  creators: string[];
  description: string;
  coverUrl?: string;
  publisher?: string;
  relations: ExternalRelation[];
  /** Only the local catalog fills these (from its fingerprint); databases leave them to the AI. */
  hints?: { tags?: Partial<import('../engine/tasteScorer').Tags>; artDriven?: boolean };
};

/** Default importance for a database relation, before the AI weighs in. Only sequel/prequel are Required. */
export function defaultImportance(kind: ExternalRelation['kind']): Importance {
  if (kind === 'sequel' || kind === 'prequel' || kind === 'parent') return 'required';
  if (kind === 'side_story' || kind === 'spin_off') return 'helpful';
  return 'optional';
}

/** "Read A before B" from "target is a <kind> of this series". Null when the relation implies no order. */
export function orderOf(thisId: string, rel: ExternalRelation): { before: string; after: string } | null {
  if (rel.direction) return rel.direction === 'after' ? { before: thisId, after: rel.externalId } : { before: rel.externalId, after: thisId };
  switch (rel.kind) {
    case 'sequel': case 'side_story': case 'spin_off': return { before: thisId, after: rel.externalId };
    case 'prequel': case 'parent': return { before: rel.externalId, after: thisId };
    default: return null;
  }
}

export class LookupError extends Error {
  constructor(message: string, readonly kind: 'network' | 'rate_limited' | 'no_key' | 'unauthorized' | 'server') { super(message); }
}

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
