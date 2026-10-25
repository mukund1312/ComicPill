// "Export my data": everything the reader created, as one readable JSON
// document they can keep. Nothing here is sent anywhere — the reader chooses
// where it goes (share sheet or clipboard). Catalog data (the comics
// themselves) is not exported; it isn't theirs and it ships with the app.
import type { AppSettings } from './model';
import type { UserProfile } from './profileModel';

export interface ExportTables {
  library: unknown[];
  events: unknown[];
  tasteSignals: unknown[];
  playlists: unknown[];
  playlistItems: unknown[];
  journeys: unknown[];
  rabbitHoles: unknown[];
  wallet: { config: unknown[]; ledger: unknown[]; piggyBanks: unknown[]; savingRules: unknown[] };
  priceAlerts: unknown[];
  cart: unknown[];
  feedback: unknown[];
}

export interface ExportBundle {
  format: 'comicpill-export';
  version: 1;
  exportedAt: string;
  profile: Omit<UserProfile, 'avatar'> & { hasAvatar: boolean };
  settings: AppSettings;
  data: ExportTables;
}

export function buildExportBundle(input: { exportedAt: Date; profile: UserProfile; settings: AppSettings; tables: ExportTables }): ExportBundle {
  const { avatar, ...profile } = input.profile; // a photo would drown the readable parts
  return {
    format: 'comicpill-export',
    version: 1,
    exportedAt: input.exportedAt.toISOString(),
    profile: { ...profile, hasAvatar: avatar !== null },
    settings: input.settings,
    data: input.tables,
  };
}

/** e.g. "1 book in your library, 12 events, 2 playlists". */
export function summarizeExport(b: ExportBundle): string {
  const n = (x: number, one: string, many = `${one}s`) => `${x} ${x === 1 ? one : many}`;
  return [
    n(b.data.library.length, 'library entry', 'library entries'),
    n(b.data.events.length, 'reading event'),
    n(b.data.playlists.length, 'playlist'),
    n(b.data.journeys.length, 'journey'),
  ].join(', ');
}

export const exportFileName = (d: Date) => `comicpill-export-${d.toISOString().slice(0, 10)}.json`;

export const serializeExport = (b: ExportBundle) => JSON.stringify(b, null, 2);
