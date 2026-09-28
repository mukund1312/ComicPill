// The 65-book seed catalog, sourced from the Longbox prototype's curated
// library and fingerprinted once (see catalog.data.json / build_catalog.py).
//
// IMPORTANT — the catalog/library split (fixing a real bug caught before it
// shipped, see the plan's "Bug caught before it shipped" note): this file
// produces two SEPARATE outputs.
//   - CATALOG_WORKS / CATALOG_EDITIONS / CATALOG_PATHS / CATALOG_PATH_ITEMS /
//     CATALOG_EDGES are global, shared knowledge — every user gets these,
//     including a brand-new signup. They carry no ownership or reading state.
//   - DEV_LIBRARY_ENTRIES is Mukund's own personal shelf (own/status/notes
//     from the prototype) and must NEVER be applied to a new user's library.
//     It is gated behind isDevSeedUser() at the call site.
import raw from './catalog.data.json';
import type { Dim, Own, PrintingType, ReadStatus, Universe } from '../../types/domain';

interface RawRow {
  id: string; title: string; lane: string; laneName: string; universe: string;
  order: number; own: string; status: string; format: string; formatWhy: string;
  note: string; flag: string | null;
  fp: Record<Dim, number>; genres: string[]; creators: string[]; characters: string[]; keeper: boolean;
}

const ROWS = raw as RawRow[];
export const FINGERPRINT_PROMPT_VERSION = 1;

export interface CatalogWork {
  id: string; title: string; sortTitle: string; matchKey: string;
  universe: Universe; fingerprint: Record<Dim, number>;
  genres: string[]; creators: string[]; characters: string[];
  keeperFlag: boolean; summary: string | null;
}
export interface CatalogEdition {
  id: string; format: 'physical' | 'digital'; printing: PrintingType; formatNote: string | null;
}
export interface CatalogEditionWork { editionId: string; workId: string; position: number }
export interface CatalogPath { id: string; name: string; pathKey: string }
export interface CatalogPathItem { pathId: string; workId: string; position: number }
export interface CatalogEdge { fromWork: string; toWork: string; type: 'same_run'; confirmed: true }
export interface DevLibraryEntry { workId: string; own: Own; status: ReadStatus }

function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Inferred from the title itself — these words are how publishers actually
// name these printings ("Absolute Batman", "... Omnibus", "Compact Comics"),
// not a guess about any specific book's real bibliographic history. Digital
// entries stay 'digital' regardless of title wording. Anything else defaults
// to 'trade_paperback', the most common form collected editions take.
function inferPrinting(title: string, format: 'physical' | 'digital'): PrintingType {
  if (format === 'digital') return 'digital';
  const t = title.toLowerCase();
  if (t.includes('absolute')) return 'absolute';
  if (t.includes('omnibus')) return 'omnibus';
  if (t.includes('deluxe')) return 'deluxe';
  if (t.includes('compact')) return 'compact';
  if (t.includes('hardcover') || t.includes(' hc')) return 'hardcover';
  return 'trade_paperback';
}

export const CATALOG_WORKS: CatalogWork[] = ROWS.map((r) => ({
  id: r.id,
  title: r.title,
  sortTitle: normalizeTitle(r.title),
  matchKey: `${normalizeTitle(r.title)}|${r.universe}`,
  universe: r.universe as Universe,
  fingerprint: r.fp,
  genres: r.genres,
  creators: r.creators,
  characters: r.characters,
  keeperFlag: r.keeper,
  summary: r.note || null,
}));

export const CATALOG_EDITIONS: CatalogEdition[] = ROWS.map((r) => ({
  id: `${r.id}-ed`,
  format: r.format as 'physical' | 'digital',
  printing: inferPrinting(r.title, r.format as 'physical' | 'digital'),
  formatNote: r.formatWhy || null,
}));

// One edition-to-work link per seed row (a 1:1 case — the seed data has no
// multi-work omnibuses yet). A real omnibus spanning several works would add
// multiple rows here, one per work it collects, in reading order.
export const CATALOG_EDITION_WORKS: CatalogEditionWork[] = ROWS.map((r) => ({
  editionId: `${r.id}-ed`,
  workId: r.id,
  position: 0,
}));

const LANE_KEYS = [...new Set(ROWS.map((r) => r.lane))];
export const CATALOG_PATHS: CatalogPath[] = LANE_KEYS.map((key) => {
  const sample = ROWS.find((r) => r.lane === key)!;
  return { id: `path-${key}`, name: sample.laneName, pathKey: key };
});

export const CATALOG_PATH_ITEMS: CatalogPathItem[] = ROWS.map((r) => ({
  pathId: `path-${r.lane}`,
  workId: r.id,
  position: r.order,
}));

// A same-run edge between consecutive books in each lane's curated order —
// the reading-order graph seeded from Mukund's own curation, per the plan's
// "story graph" section: this compounds for every future user who scans one
// of these books, even though their own library starts empty.
export const CATALOG_EDGES: CatalogEdge[] = [];
for (const lane of LANE_KEYS) {
  const items = ROWS.filter((r) => r.lane === lane).sort((a, b) => a.order - b.order);
  for (let i = 0; i < items.length - 1; i++) {
    CATALOG_EDGES.push({ fromWork: items[i].id, toWork: items[i + 1].id, type: 'same_run', confirmed: true });
  }
}

// Dev-only: Mukund's own ownership/read history from the Longbox prototype.
// Never applied to a real new user — see isDevSeedUser() at the call site.
export const DEV_LIBRARY_ENTRIES: DevLibraryEntry[] = ROWS.map((r) => ({
  workId: r.id,
  own: r.own as Own,
  status: r.status as ReadStatus,
}));
