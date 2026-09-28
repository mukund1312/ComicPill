// Local SQLite mirror. This device is the source of truth for reading Today,
// Library and Paths — nothing here awaits a network round trip. Sync to
// Supabase is a separate concern (not yet wired in this pass; see the plan's
// "Data layer" section).
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const works = sqliteTable('works', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  sortTitle: text('sort_title').notNull(),
  matchKey: text('match_key').notNull(),
  publisher: text('publisher'),
  universe: text('universe').notNull().default('main'),
  fingerprint: text('fingerprint', { mode: 'json' }).$type<Record<string, number> | null>(),
  genres: text('genres', { mode: 'json' }).$type<string[]>().notNull().default([]),
  creators: text('creators', { mode: 'json' }).$type<string[]>().notNull().default([]),
  characters: text('characters', { mode: 'json' }).$type<string[]>().notNull().default([]),
  keeperFlag: integer('keeper_flag', { mode: 'boolean' }).notNull().default(false),
  contextNeeded: text('context_needed').notNull().default('none'),
  summary: text('summary'),
  coverPath: text('cover_path'),
  fingerprintPromptVersion: integer('fingerprint_prompt_version').notNull().default(0),
});

export const editions = sqliteTable('editions', {
  id: text('id').primaryKey(),
  workId: text('work_id').notNull(),
  format: text('format').notNull(), // 'physical' | 'digital'
  printing: text('printing'),
  isbn13: text('isbn13'),
  pages: integer('pages'),
  typicalPricePaise: integer('typical_price_paise'),
  formatNote: text('format_note'),
});

export const storyEdges = sqliteTable('story_edges', {
  id: text('id').primaryKey(),
  fromWork: text('from_work').notNull(),
  toWork: text('to_work').notNull(),
  type: text('type').notNull(),
  confirmed: integer('confirmed', { mode: 'boolean' }).notNull().default(true),
  source: text('source').notNull().default('seed'),
});

export const paths = sqliteTable('paths', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  pathKey: text('path_key').notNull(),
  contextLevel: text('context_level').notNull().default('recommended'),
});

export const pathItems = sqliteTable('path_items', {
  pathId: text('path_id').notNull(),
  workId: text('work_id').notNull(),
  position: real('position').notNull(),
});

export const userLibrary = sqliteTable('user_library', {
  workId: text('work_id').primaryKey(),
  own: text('own').notNull().default('none'),
  status: text('status').notNull().default('none'),
  rating: integer('rating'), // 1..5, Not for me..Loved it
  finishedAt: text('finished_at'),
  notInterested: integer('not_interested', { mode: 'boolean' }).notNull().default(false),
  updatedAt: text('updated_at').notNull(),
});

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  workId: text('work_id'),
  type: text('type').notNull(),
  dimension: text('dimension'),
  tagKind: text('tag_kind'),
  tagValue: text('tag_value'),
  value: real('value'),
  calibration: text('calibration'),
  appetite: text('appetite'),
  exploreGoodOrBetter: integer('explore_good_or_better', { mode: 'boolean' }),
  occurredAt: text('occurred_at').notNull(),
});

export const tasteProfiles = sqliteTable('taste_profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }), // single row, id=1
  engineVersion: integer('engine_version').notNull(),
  data: text('data', { mode: 'json' }).notNull(), // the whole TasteProfile, recomputed
  updatedAt: text('updated_at').notNull(),
});

export const shown = sqliteTable('shown', {
  id: text('id').primaryKey(),
  workId: text('work_id').notNull(),
  slot: text('slot').notNull(), // 'continue' | 'switch' | 'explore' | 'deck'
  scoreParts: text('score_parts', { mode: 'json' }).notNull(),
  outcome: text('outcome'), // filled in later: started, finished, dismissed...
  shownAt: text('shown_at').notNull(),
});

export const notTonight = sqliteTable('not_tonight', {
  id: text('id').primaryKey(),
  workId: text('work_id').notNull(),
  at: text('at').notNull(),
});
