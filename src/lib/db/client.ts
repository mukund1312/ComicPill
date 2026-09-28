// Local SQLite client. This pass wires the on-device database only — the
// Supabase sync layer described in the plan is a later milestone, so tables
// are created directly here rather than through the full drizzle-kit +
// Postgres migration pipeline (which matters once two schemas must agree).
import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

const sqlite = openDatabaseSync('comicpill.db');

export const db = drizzle(sqlite, { schema });

const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS series (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, publisher TEXT, universe TEXT NOT NULL DEFAULT 'main',
  volume_label TEXT, start_year INTEGER, end_year INTEGER
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

CREATE TABLE IF NOT EXISTS user_library (
  work_id TEXT PRIMARY KEY, own TEXT NOT NULL DEFAULT 'none', status TEXT NOT NULL DEFAULT 'none',
  rating INTEGER, finished_at TEXT, not_interested INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
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
`;

let bootstrapped = false;

export function ensureSchema(): void {
  if (bootstrapped) return;
  sqlite.execSync(BOOTSTRAP_SQL);
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
    DELETE FROM path_items; DELETE FROM user_library; DELETE FROM events; DELETE FROM taste_profiles;
    DELETE FROM shown; DELETE FROM not_tonight;
  `);
}
