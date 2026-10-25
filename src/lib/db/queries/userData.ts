// Everything the reader created, and the two things they can do with it:
// take a copy (export) or wipe it (clear). The comics themselves — the
// catalog, editions, prices, reading-order edges — are never touched by
// either; they ship with the app.
import { db, sqlite } from '../client';
import {
  cartItems, events, feedback, piggyBanks, playlistItems, playlists, priceAlerts, rabbitHoles, savingRules,
  tasteSignals, userArcs, userLibrary, walletConfig, walletLedger,
} from '../schema';
import { buildExportBundle, type ExportBundle } from '../../settings/exportModel';
import type { AppSettings } from '../../settings/model';
import type { UserProfile } from '../../settings/profileModel';
import { DEV_SHELF_KEY, setMeta } from './meta';

export function exportUserData(now: Date, profile: UserProfile, settings: AppSettings): ExportBundle {
  return buildExportBundle({
    exportedAt: now, profile, settings,
    tables: {
      library: db.select().from(userLibrary).all(),
      events: db.select().from(events).all(),
      tasteSignals: db.select().from(tasteSignals).all(),
      playlists: db.select().from(playlists).all(),
      playlistItems: db.select().from(playlistItems).all(),
      journeys: db.select().from(userArcs).all(),
      rabbitHoles: db.select().from(rabbitHoles).all(),
      wallet: {
        config: db.select().from(walletConfig).all(),
        ledger: db.select().from(walletLedger).all(),
        piggyBanks: db.select().from(piggyBanks).all(),
        savingRules: db.select().from(savingRules).all(),
      },
      priceAlerts: db.select().from(priceAlerts).all(),
      cart: db.select().from(cartItems).all(),
      feedback: db.select().from(feedback).all(),
    },
  });
}

/** Tables that hold the reader's own data. Order is irrelevant (no foreign keys). */
const USER_TABLES = [
  'user_library', 'events', 'taste_profiles', 'taste_signals', 'shown', 'not_tonight',
  'playlists', 'playlist_items', 'user_arcs', 'rabbit_holes',
  'wallet_config', 'wallet_ledger', 'piggy_banks', 'saving_rules', 'price_alerts', 'cart_items', 'feedback',
] as const;

/** Wipe the reader's library, history, playlists, journeys and wallet in one
 *  transaction (all or nothing). Also records that the demo shelf must not be
 *  re-seeded, or "clear" would quietly undo itself on the next launch. */
export function clearUserData(): void {
  sqlite.execSync(`BEGIN; ${USER_TABLES.map((t) => `DELETE FROM ${t};`).join(' ')} COMMIT;`);
  setMeta(DEV_SHELF_KEY, '1');
}

export interface DataSummary { inLibrary: number; finished: number; reading: number; events: number; playlists: number; journeys: number; catalog: number }

export function dataSummary(): DataSummary {
  const count = (table: string, where = ''): number =>
    sqlite.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} ${where}`)?.n ?? 0;
  return {
    inLibrary: count('user_library', "WHERE own != 'none' OR status != 'none'"),
    finished: count('user_library', "WHERE status = 'done'"),
    reading: count('user_library', "WHERE status = 'reading'"),
    events: count('events'),
    playlists: count('playlists'),
    journeys: count('user_arcs'),
    catalog: count('works'),
  };
}
