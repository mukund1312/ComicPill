import { describe, expect, it } from 'vitest';
import { buildExportBundle, exportFileName, serializeExport, summarizeExport, type ExportTables } from './exportModel';
import { DEFAULT_SETTINGS } from './model';
import { DEFAULT_PROFILE } from './profileModel';

const tables = (over: Partial<ExportTables> = {}): ExportTables => ({
  library: [], events: [], tasteSignals: [], playlists: [], playlistItems: [], journeys: [], rabbitHoles: [],
  wallet: { config: [], ledger: [], piggyBanks: [], savingRules: [] }, priceAlerts: [], cart: [], feedback: [], ...over,
});
const now = new Date('2026-09-30T10:00:00Z');

describe('export bundle', () => {
  const b = buildExportBundle({ exportedAt: now, profile: { ...DEFAULT_PROFILE, avatar: 'data:image/jpeg;base64,AAAA' }, settings: DEFAULT_SETTINGS, tables: tables({ library: [{ workId: 'x' }] }) });

  it('is self-describing and versioned', () => {
    expect(b).toMatchObject({ format: 'comicpill-export', version: 1, exportedAt: '2026-09-30T10:00:00.000Z' });
  });
  it('keeps the profile readable by replacing the photo with a flag', () => {
    expect(b.profile).not.toHaveProperty('avatar');
    expect(b.profile.hasAvatar).toBe(true);
    expect(JSON.stringify(b)).not.toContain('base64');
  });
  it('carries the reader’s data and settings', () => {
    expect(b.data.library).toEqual([{ workId: 'x' }]);
    expect(b.settings).toEqual(DEFAULT_SETTINGS);
  });
  it('round-trips through JSON', () => {
    expect(JSON.parse(serializeExport(b))).toEqual(b);
  });
  it('names the file by date', () => {
    expect(exportFileName(now)).toBe('comicpill-export-2026-09-30.json');
  });
  it('summarises with correct singular/plural', () => {
    expect(summarizeExport(b)).toBe('1 library entry, 0 reading events, 0 playlists, 0 journeys');
    const many = buildExportBundle({ exportedAt: now, profile: DEFAULT_PROFILE, settings: DEFAULT_SETTINGS, tables: tables({ library: [1, 2], events: [1], playlists: [1], journeys: [1, 2, 3] }) });
    expect(summarizeExport(many)).toBe('2 library entries, 1 reading event, 1 playlist, 3 journeys');
  });
  it('a profile with no photo says so', () => {
    expect(buildExportBundle({ exportedAt: now, profile: DEFAULT_PROFILE, settings: DEFAULT_SETTINGS, tables: tables() }).profile.hasAvatar).toBe(false);
  });
});
