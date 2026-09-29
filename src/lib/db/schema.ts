// Local SQLite mirror. This device is the source of truth for reading Today,
// Library and Paths — nothing here awaits a network round trip. Sync to
// Supabase is a separate concern (not yet wired in this pass; see the plan's
// "Data layer" section).
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// Bibliographic layer: series -> issues -> (work_issues) -> works
// ---------------------------------------------------------------------------
// A `series` is the ongoing periodical (e.g. one numbered run of a title,
// often rebooted with a new volume over decades — "Batman (2011)" and
// "Batman (2016)" are two different series rows).
export const series = sqliteTable('series', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  publisher: text('publisher'),
  universe: text('universe').notNull().default('main'),
  volumeLabel: text('volume_label'), // e.g. "Vol. 2", "(2011)"
  startYear: integer('start_year'),
  endYear: integer('end_year'), // null if ongoing
  status: text('status').notNull().default('ongoing'), // 'ongoing' | 'complete' | 'hiatus'
  releasedVolumeCount: integer('released_volume_count'), // how many collected volumes exist so far
  plannedVolumeCount: integer('planned_volume_count'), // only meaningful for an announced fixed run
});

// An `issue` is one periodical chapter. `sortPosition` (not `issueNumber`)
// is what orders issues correctly — annuals, one-shots, and "#0"/"#1,000,000"
// specials don't sort as plain numbers, but they do have a real place in the
// series' chronological run.
export const issues = sqliteTable('issues', {
  id: text('id').primaryKey(),
  seriesId: text('series_id').notNull(),
  issueNumber: text('issue_number').notNull(), // display label: "1", "0", "Annual 1"
  sortPosition: real('sort_position').notNull(),
  title: text('title'), // an issue-specific subtitle, if any
  coverDate: text('cover_date'), // "YYYY-MM" — the cover-dated month, not the real ship date
  onSaleDate: text('on_sale_date'),
  pageCount: integer('page_count'),
  coverPath: text('cover_path'),
  synopsis: text('synopsis'),
});

export const issueCreators = sqliteTable('issue_creators', {
  issueId: text('issue_id').notNull(),
  creatorName: text('creator_name').notNull(),
  role: text('role').notNull(), // 'writer' | 'artist' | 'inker' | 'colorist' | 'letterer' | 'cover'
});

// A `work` is the STORY as a reading unit (what the whole rest of the app
// scores, recommends and tracks reading status for) — e.g. one collected
// story arc. `work_issues` says exactly which issues make it up, in order;
// most works draw from one series, but the join makes a crossover spanning
// two series representable too.
export const works = sqliteTable('works', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  sortTitle: text('sort_title').notNull(),
  matchKey: text('match_key').notNull(),
  publisher: text('publisher'),
  universe: text('universe').notNull().default('main'),
  primarySeriesId: text('primary_series_id'), // convenience pointer; work_issues is the source of truth
  fingerprint: text('fingerprint', { mode: 'json' }).$type<Record<string, number> | null>(),
  genres: text('genres', { mode: 'json' }).$type<string[]>().notNull().default([]),
  creators: text('creators', { mode: 'json' }).$type<string[]>().notNull().default([]),
  characters: text('characters', { mode: 'json' }).$type<string[]>().notNull().default([]),
  keeperFlag: integer('keeper_flag', { mode: 'boolean' }).notNull().default(false),
  contextNeeded: text('context_needed').notNull().default('none'),
  completeness: text('completeness').notNull().default('complete'), // 'complete' | 'ongoing' | 'part_of_n'
  summary: text('summary'),
  coverPath: text('cover_path'),
  fingerprintPromptVersion: integer('fingerprint_prompt_version').notNull().default(0),
});

export const workIssues = sqliteTable('work_issues', {
  workId: text('work_id').notNull(),
  issueId: text('issue_id').notNull(),
  position: real('position').notNull(),
});

// ---------------------------------------------------------------------------
// Commerce layer: editions (the physical/digital PRODUCT you can own or buy)
// ---------------------------------------------------------------------------
// `printing` is the real comics-market distinction the "which one should I
// buy" comparison (and the Compare screen's purchase labels) depends on —
// single issues, trade paperbacks, hardcovers, deluxe editions, omnibuses,
// absolute editions, the newer small-trim "compact" format, and digital.
// An edition is scoped to EITHER issues (a single-issue purchase — see
// edition_issues) OR works (everything else, via edition_works) — never
// both, matching how these are actually sold. Critically, an omnibus or
// "complete collection" can span MULTIPLE works — that's exactly why
// edition_works is a join table and not a single work_id foreign key.
export const editions = sqliteTable('editions', {
  id: text('id').primaryKey(),
  printing: text('printing').notNull().default('trade_paperback'),
  // 'single_issue' | 'trade_paperback' | 'hardcover' | 'deluxe' | 'omnibus'
  // | 'absolute' | 'compact' | 'digital'
  format: text('format').notNull(), // 'physical' | 'digital' — orthogonal to printing (a digital single issue is printing='single_issue', format='digital')
  isbn13: text('isbn13'),
  diamondCode: text('diamond_code'), // single-issue distributor code, where relevant
  pages: integer('pages'),
  typicalPricePaise: integer('typical_price_paise'),
  releaseDate: text('release_date'),
  formatNote: text('format_note'),
});

export const editionWorks = sqliteTable('edition_works', {
  editionId: text('edition_id').notNull(),
  workId: text('work_id').notNull(),
  position: real('position').notNull().default(0), // ordering within a multi-work omnibus
});

export const editionIssues = sqliteTable('edition_issues', {
  editionId: text('edition_id').notNull(),
  issueId: text('issue_id').notNull(),
});

// ---------------------------------------------------------------------------
export const storyEdges = sqliteTable('story_edges', {
  id: text('id').primaryKey(),
  fromWork: text('from_work').notNull(),
  toWork: text('to_work').notNull(),
  type: text('type').notNull(),
  // 'required' | 'strongly_recommended' | 'useful_context' | 'optional' | 'tie_in'
  strength: text('strength').notNull().default('optional'),
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

// A playlist is a personal, editable reading list — reuses the same
// "ordered works" shape as paths/path_items but is user-owned and never
// graph-expanded. Progress is derived from user_library.status, same as
// paths, so there's no separate progress column here.
export const playlists = sqliteTable('playlists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdBy: text('created_by').notNull().default('user'), // 'user' | 'app'
  sourceHint: text('source_hint'), // mood/character/seed, if app-made
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const playlistItems = sqliteTable('playlist_items', {
  playlistId: text('playlist_id').notNull(),
  workId: text('work_id').notNull(),
  position: real('position').notNull(),
  addedAt: text('added_at').notNull(),
});

// ---------------------------------------------------------------------------
// Comic Wallet + Piggy Bank + Smart Purchase System — virtual ledger only.
// See the plan's "Comic Wallet..." section: no payment-provider fields
// anywhere here by design; `wallet_ledger.note`/future `reference` column is
// where a real provider transaction id would go once V1.5/V2 exists.
// ---------------------------------------------------------------------------
export const walletConfig = sqliteTable('wallet_config', {
  id: integer('id').primaryKey({ autoIncrement: true }), // single row, id=1
  monthlyBudgetPaise: integer('monthly_budget_paise').notNull().default(0),
  budgetResetDay: integer('budget_reset_day').notNull().default(1),
  rolloverEnabled: integer('rollover_enabled', { mode: 'boolean' }).notNull().default(false),
  savingsCountsTowardBudget: integer('savings_counts_toward_budget', { mode: 'boolean' }).notNull().default(true),
});

export const walletLedger = sqliteTable('wallet_ledger', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // 'top_up' | 'purchase' | 'piggy_contribution' | 'piggy_refund'
  amountPaise: integer('amount_paise').notNull(),
  piggyBankId: text('piggy_bank_id'),
  workId: text('work_id'),
  note: text('note'),
  occurredAt: text('occurred_at').notNull(),
});

export const piggyBanks = sqliteTable('piggy_banks', {
  id: text('id').primaryKey(),
  workId: text('work_id').notNull(),
  editionId: text('edition_id'),
  name: text('name').notNull(),
  targetPaise: integer('target_paise').notNull(),
  savedPaise: integer('saved_paise').notNull().default(0),
  status: text('status').notNull().default('saving'), // saving|ready|purchased|cancelled
  priority: integer('priority').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const savingRules = sqliteTable('saving_rules', {
  id: text('id').primaryKey(),
  piggyBankId: text('piggy_bank_id').notNull(),
  amountPaise: integer('amount_paise').notNull(),
  frequency: text('frequency').notNull(), // daily|weekly|monthly|custom|manual
  customEveryDays: integer('custom_every_days'),
});

export const retailers = sqliteTable('retailers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
});

export const comicPrices = sqliteTable('comic_prices', {
  id: text('id').primaryKey(),
  editionId: text('edition_id').notNull(),
  retailerId: text('retailer_id').notNull(),
  pricePaise: integer('price_paise').notNull(),
  shippingPaise: integer('shipping_paise').notNull().default(0),
  url: text('url'),
  capturedAt: text('captured_at').notNull(),
});

export const priceAlerts = sqliteTable('price_alerts', {
  id: text('id').primaryKey(),
  workId: text('work_id').notNull(),
  editionId: text('edition_id').notNull(),
  targetPricePaise: integer('target_price_paise').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

export const cartItems = sqliteTable('cart_items', {
  id: text('id').primaryKey(),
  workId: text('work_id').notNull(),
  editionId: text('edition_id').notNull(),
  addedAt: text('added_at').notNull(),
});

export const userLibrary = sqliteTable('user_library', {
  workId: text('work_id').primaryKey(),
  own: text('own').notNull().default('none'), // physical|digital|both|wishlist|ordered|subscription|none
  ownedEditionId: text('owned_edition_id'), // which specific edition, for "should I upgrade the edition" decisions
  status: text('status').notNull().default('none'),
  rating: integer('rating'), // 1..5, Not for me..Loved it
  finishedAt: text('finished_at'),
  notInterested: integer('not_interested', { mode: 'boolean' }).notNull().default(false),
  pricePaidPaise: integer('price_paid_paise'),
  purchasedAt: text('purchased_at'),
  store: text('store'),
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
