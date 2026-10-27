// Local SQLite client. This pass wires the on-device database only — the
// Supabase sync layer described in the plan is a later milestone, so tables
// are created directly here rather than through the full drizzle-kit +
// Postgres migration pipeline (which matters once two schemas must agree).
import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

export const sqlite = openDatabaseSync('comicpill.db');

export const db = drizzle(sqlite, { schema });

const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS series (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, publisher TEXT, universe TEXT NOT NULL DEFAULT 'main',
  volume_label TEXT, start_year INTEGER, end_year INTEGER,
  status TEXT NOT NULL DEFAULT 'ongoing', released_volume_count INTEGER, planned_volume_count INTEGER
);

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY, series_id TEXT NOT NULL, issue_number TEXT NOT NULL, sort_position REAL NOT NULL,
  title TEXT, cover_date TEXT, on_sale_date TEXT, page_count INTEGER, cover_path TEXT, synopsis TEXT
);
CREATE INDEX IF NOT EXISTS issues_series_id ON issues(series_id, sort_position);

CREATE TABLE IF NOT EXISTS issue_creators (
  issue_id TEXT NOT NULL, creator_name TEXT NOT NULL, role TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS issue_creators_issue_id ON issue_creators(issue_id);

CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, sort_title TEXT NOT NULL, match_key TEXT NOT NULL,
  publisher TEXT, universe TEXT NOT NULL DEFAULT 'main', primary_series_id TEXT, fingerprint TEXT,
  genres TEXT NOT NULL DEFAULT '[]', creators TEXT NOT NULL DEFAULT '[]', characters TEXT NOT NULL DEFAULT '[]',
  keeper_flag INTEGER NOT NULL DEFAULT 0, context_needed TEXT NOT NULL DEFAULT 'none',
  completeness TEXT NOT NULL DEFAULT 'complete',
  summary TEXT, cover_path TEXT, fingerprint_prompt_version INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS works_match_key ON works(match_key);

CREATE TABLE IF NOT EXISTS work_issues (
  work_id TEXT NOT NULL, issue_id TEXT NOT NULL, position REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS work_issues_work_id ON work_issues(work_id, position);

CREATE TABLE IF NOT EXISTS editions (
  id TEXT PRIMARY KEY, printing TEXT NOT NULL DEFAULT 'trade_paperback', format TEXT NOT NULL,
  isbn13 TEXT, diamond_code TEXT, pages INTEGER, typical_price_paise INTEGER,
  release_date TEXT, format_note TEXT
);

CREATE TABLE IF NOT EXISTS edition_works (
  edition_id TEXT NOT NULL, work_id TEXT NOT NULL, position REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS edition_works_edition_id ON edition_works(edition_id);
CREATE INDEX IF NOT EXISTS edition_works_work_id ON edition_works(work_id);

CREATE TABLE IF NOT EXISTS edition_issues (
  edition_id TEXT NOT NULL, issue_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS edition_issues_edition_id ON edition_issues(edition_id);

CREATE TABLE IF NOT EXISTS story_edges (
  id TEXT PRIMARY KEY, from_work TEXT NOT NULL, to_work TEXT NOT NULL, type TEXT NOT NULL,
  strength TEXT NOT NULL DEFAULT 'optional',
  confirmed INTEGER NOT NULL DEFAULT 1, source TEXT NOT NULL DEFAULT 'seed'
);
CREATE INDEX IF NOT EXISTS story_edges_from ON story_edges(from_work);
CREATE INDEX IF NOT EXISTS story_edges_to ON story_edges(to_work);

CREATE TABLE IF NOT EXISTS paths (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, path_key TEXT NOT NULL, context_level TEXT NOT NULL DEFAULT 'recommended'
);

CREATE TABLE IF NOT EXISTS path_items (
  path_id TEXT NOT NULL, work_id TEXT NOT NULL, position REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS path_items_path_id ON path_items(path_id, position);

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, created_by TEXT NOT NULL DEFAULT 'user',
  source_hint TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_items (
  playlist_id TEXT NOT NULL, work_id TEXT NOT NULL, position REAL NOT NULL, added_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS playlist_items_playlist_id ON playlist_items(playlist_id, position);

CREATE TABLE IF NOT EXISTS wallet_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT, monthly_budget_paise INTEGER NOT NULL DEFAULT 0,
  budget_reset_day INTEGER NOT NULL DEFAULT 1, rollover_enabled INTEGER NOT NULL DEFAULT 0,
  savings_counts_toward_budget INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, amount_paise INTEGER NOT NULL,
  piggy_bank_id TEXT, work_id TEXT, note TEXT, occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS wallet_ledger_occurred_at ON wallet_ledger(occurred_at);

CREATE TABLE IF NOT EXISTS piggy_banks (
  id TEXT PRIMARY KEY, work_id TEXT NOT NULL, edition_id TEXT, name TEXT NOT NULL,
  target_paise INTEGER NOT NULL, saved_paise INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'saving', priority INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saving_rules (
  id TEXT PRIMARY KEY, piggy_bank_id TEXT NOT NULL, amount_paise INTEGER NOT NULL,
  frequency TEXT NOT NULL, custom_every_days INTEGER
);
CREATE INDEX IF NOT EXISTS saving_rules_piggy_bank_id ON saving_rules(piggy_bank_id);

CREATE TABLE IF NOT EXISTS retailers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comic_prices (
  id TEXT PRIMARY KEY, edition_id TEXT NOT NULL, retailer_id TEXT NOT NULL,
  price_paise INTEGER NOT NULL, shipping_paise INTEGER NOT NULL DEFAULT 0,
  url TEXT, captured_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS comic_prices_edition_id ON comic_prices(edition_id, captured_at);

CREATE TABLE IF NOT EXISTS price_alerts (
  id TEXT PRIMARY KEY, work_id TEXT NOT NULL, edition_id TEXT NOT NULL,
  target_price_paise INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY, work_id TEXT NOT NULL, edition_id TEXT NOT NULL, added_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY, category TEXT NOT NULL DEFAULT 'bug', message TEXT NOT NULL,
  screen TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_created_at ON feedback(created_at);

CREATE TABLE IF NOT EXISTS user_arcs (
  id TEXT PRIMARY KEY, template_key TEXT NOT NULL, goal_text TEXT NOT NULL,
  depth TEXT NOT NULL DEFAULT 'recommended', intent TEXT, parent_arc_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rabbit_holes (
  id TEXT PRIMARY KEY, topic TEXT NOT NULL, source_work_id TEXT,
  status TEXT NOT NULL DEFAULT 'saved', created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_library (
  work_id TEXT PRIMARY KEY, own TEXT NOT NULL DEFAULT 'none', owned_edition_id TEXT,
  status TEXT NOT NULL DEFAULT 'none',
  rating INTEGER, finished_at TEXT, not_interested INTEGER NOT NULL DEFAULT 0,
  price_paid_paise INTEGER, purchased_at TEXT, store TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS user_library_status ON user_library(status);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, work_id TEXT, type TEXT NOT NULL, dimension TEXT,
  tag_kind TEXT, tag_value TEXT, value REAL, calibration TEXT,
  appetite TEXT, explore_good_or_better INTEGER, occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_occurred_at ON events(occurred_at);
CREATE INDEX IF NOT EXISTS events_work_id ON events(work_id);

CREATE TABLE IF NOT EXISTS taste_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT, engine_version INTEGER NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shown (
  id TEXT PRIMARY KEY, work_id TEXT NOT NULL, slot TEXT NOT NULL, score_parts TEXT NOT NULL,
  outcome TEXT, shown_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS not_tonight (
  id TEXT PRIMARY KEY, work_id TEXT NOT NULL, at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS taste_signals (
  id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, signal TEXT NOT NULL,
  source TEXT NOT NULL, strength REAL NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS taste_signals_source ON taste_signals(source);

CREATE TABLE IF NOT EXISTS reader_comics (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, path TEXT NOT NULL, format TEXT NOT NULL,
  page_count INTEGER NOT NULL, cover_path TEXT, added_at INTEGER NOT NULL,
  last_read_at INTEGER, progress_page INTEGER NOT NULL DEFAULT 0, mode TEXT NOT NULL DEFAULT 'ltr'
);

-- Comic Mind Space: screenshots -> captures -> series -> relations -> ratings -> scores -> verdicts -> digests
CREATE TABLE IF NOT EXISTS ms_screenshots (
  id TEXT PRIMARY KEY, asset_id TEXT NOT NULL UNIQUE, uri TEXT NOT NULL, taken_at INTEGER NOT NULL, added_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new', gate TEXT, gate_reason TEXT, ocr_text TEXT, error TEXT, summary TEXT
);
CREATE INDEX IF NOT EXISTS ms_screenshots_status ON ms_screenshots(status, taken_at);

CREATE TABLE IF NOT EXISTS ms_captures (
  id TEXT PRIMARY KEY, screenshot_id TEXT NOT NULL, title TEXT NOT NULL, title_conf TEXT NOT NULL, creators_json TEXT NOT NULL DEFAULT '[]',
  medium TEXT NOT NULL DEFAULT 'unknown', status TEXT NOT NULL, series_id TEXT, options_json TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ms_captures_screenshot ON ms_captures(screenshot_id);

CREATE TABLE IF NOT EXISTS ms_series (
  id TEXT PRIMARY KEY, source TEXT NOT NULL, external_id TEXT NOT NULL, title TEXT NOT NULL, medium TEXT NOT NULL DEFAULT 'unknown',
  year INTEGER, run_status TEXT NOT NULL DEFAULT 'unknown', units INTEGER NOT NULL DEFAULT 0, unit_name TEXT NOT NULL DEFAULT 'volumes',
  tags_json TEXT NOT NULL DEFAULT '{}', creators_json TEXT NOT NULL DEFAULT '[]', description TEXT NOT NULL DEFAULT '', cover_url TEXT,
  publisher TEXT, art_driven INTEGER NOT NULL DEFAULT 0, print_status TEXT NOT NULL DEFAULT 'unknown', price_rising INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0, stub INTEGER NOT NULL DEFAULT 0, judged INTEGER NOT NULL DEFAULT 0,
  read_status TEXT NOT NULL DEFAULT 'planned', created_at INTEGER NOT NULL, found_at INTEGER,
  UNIQUE (source, external_id)
);

CREATE TABLE IF NOT EXISTS ms_relations (
  before_id TEXT NOT NULL, after_id TEXT NOT NULL, importance TEXT NOT NULL, confidence TEXT NOT NULL, note TEXT,
  wrong INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
  PRIMARY KEY (before_id, after_id)
);

CREATE TABLE IF NOT EXISTS ms_ratings (
  series_id TEXT PRIMARY KEY, rating INTEGER NOT NULL, dropped INTEGER NOT NULL DEFAULT 0, override_score INTEGER, rated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ms_verdict_overrides (
  series_id TEXT PRIMARY KEY, overrides_json TEXT NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ms_digests (
  week TEXT PRIMARY KEY, json TEXT NOT NULL, created_at INTEGER NOT NULL, notified_at INTEGER
);

CREATE TABLE IF NOT EXISTS ms_cache (
  key TEXT PRIMARY KEY, json TEXT NOT NULL, fetched_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reader_folders (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, preset_id TEXT, created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reader_collections (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reader_collection_items (
  collection_id TEXT NOT NULL, comic_id TEXT NOT NULL, added_at INTEGER NOT NULL,
  PRIMARY KEY (collection_id, comic_id)
);

CREATE TABLE IF NOT EXISTS reader_presets (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, mode TEXT NOT NULL, fit TEXT NOT NULL, background TEXT NOT NULL, created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reader_panels (
  comic_id TEXT NOT NULL, page INTEGER NOT NULL, panels_json TEXT NOT NULL,
  PRIMARY KEY (comic_id, page)
);

CREATE TABLE IF NOT EXISTS reader_bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, comic_id TEXT NOT NULL, page INTEGER NOT NULL, created_at INTEGER NOT NULL,
  UNIQUE (comic_id, page)
);
`;

let bootstrapped = false;

export function ensureSchema(): void {
  if (bootstrapped) return;
  sqlite.execSync(BOOTSTRAP_SQL);
  // reader_comics gained columns after first release; CREATE IF NOT EXISTS won't add them.
  const cols = sqlite.getAllSync<{ name: string }>('PRAGMA table_info(reader_comics)').map((c) => c.name);
  const added: Array<[string, string]> = [
    ['progress_offset', 'REAL NOT NULL DEFAULT 0'], ['sizes_json', 'TEXT'],
    ['series', 'TEXT'], ['issue', 'TEXT'], ['writer', 'TEXT'], ['folder_id', 'TEXT'], ['preset_id', 'TEXT'],
    ['lock_hash', 'TEXT'], ['lock_salt', 'TEXT'], ['work_id', 'TEXT'], ['size_bytes', 'INTEGER'], ['source_uri', 'TEXT'], ['source_key', 'TEXT'],
  ];
  for (const [name, def] of added) if (!cols.includes(name)) sqlite.execSync(`ALTER TABLE reader_comics ADD COLUMN ${name} ${def}`);
  const folderCols = sqlite.getAllSync<{ name: string }>('PRAGMA table_info(reader_folders)').map((c) => c.name);
  for (const name of ['lock_hash', 'lock_salt', 'parent_id']) if (!folderCols.includes(name)) sqlite.execSync(`ALTER TABLE reader_folders ADD COLUMN ${name} TEXT`);
  bootstrapped = true;
}

/** Call once from the app's root layout, before any screen reads the db. */
export function initDatabase(): void {
  ensureSchema();
  // Imported lazily to avoid a require cycle (seed/claim imports schema+client).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { bootstrap } = require('./seed/claim');
  bootstrap();
}

export function resetDatabase(): void {
  sqlite.execSync(`
    DELETE FROM series; DELETE FROM issues; DELETE FROM issue_creators;
    DELETE FROM works; DELETE FROM work_issues;
    DELETE FROM editions; DELETE FROM edition_works; DELETE FROM edition_issues;
    DELETE FROM story_edges; DELETE FROM paths;
    DELETE FROM path_items; DELETE FROM playlists; DELETE FROM playlist_items;
    DELETE FROM user_library; DELETE FROM user_arcs; DELETE FROM rabbit_holes; DELETE FROM events; DELETE FROM taste_profiles;
    DELETE FROM shown; DELETE FROM not_tonight;
    DELETE FROM wallet_config; DELETE FROM wallet_ledger; DELETE FROM piggy_banks;
    DELETE FROM saving_rules; DELETE FROM retailers; DELETE FROM comic_prices;
    DELETE FROM price_alerts; DELETE FROM cart_items;
  `);
}
