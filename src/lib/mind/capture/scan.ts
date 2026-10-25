// Gallery access, kept as narrow as Android allows: the reader picks ONE album, and only images taken
// after the last scan are listed. Nothing else in the gallery is ever opened.
import { Album, AssetField, MediaType, Query, getPermissionsAsync, requestPermissionsAsync } from 'expo-media-library';
import { getMindSettings, updateMindSettings } from '../settings';
import type { MindStore } from '../store';

export type Access = 'granted' | 'limited' | 'denied';

const toAccess = (r: { granted: boolean; accessPrivileges?: string }): Access => (!r.granted ? 'denied' : r.accessPrivileges === 'limited' ? 'limited' : 'granted');

export async function galleryAccess(): Promise<Access> {
  try { return toAccess(await getPermissionsAsync(false, ['photo'])); } catch { return 'denied'; }
}
export async function requestGalleryAccess(): Promise<Access> {
  try { return toAccess(await requestPermissionsAsync(false, ['photo'])); } catch { return 'denied'; }
}

export async function listAlbumTitles(): Promise<string[]> {
  try {
    const albums = await Album.getAll();
    const titles = await Promise.all(albums.map((a) => a.getTitle().catch(() => '')));
    return [...new Set(titles.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  } catch { return []; }
}

const MAX_PER_SCAN = 100;

/** New images in the watched album since the last scan → Screenshot rows. Returns how many were new. */
export async function scanNewScreenshots(store: MindStore, since?: number): Promise<number> {
  const s = getMindSettings();
  if (!s.watching || (await galleryAccess()) === 'denied') return 0;
  const album = await Album.get(s.albumTitle).catch(() => null);
  if (!album) return 0;
  const from = since ?? s.lastScanAt;
  const assets = await new Query().album(album).gt(AssetField.CREATION_TIME, from).orderBy(AssetField.CREATION_TIME).limit(MAX_PER_SCAN).exe();
  const rows: Array<{ assetId: string; uri: string; takenAt: number }> = [];
  let newest = from;
  for (const a of assets) {
    try {
      const info = await a.getInfo();
      if (info.mediaType !== MediaType.IMAGE) continue;
      const takenAt = info.creationTime ?? Date.now();
      rows.push({ assetId: a.id, uri: info.uri, takenAt });
      newest = Math.max(newest, takenAt);
    } catch { /* an asset that vanished mid-scan is just skipped */ }
  }
  const added = rows.length ? store.addScreenshots(rows) : 0;
  if (since === undefined && newest > s.lastScanAt) updateMindSettings({ lastScanAt: newest });
  return added;
}
