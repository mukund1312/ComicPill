import { and, eq } from 'drizzle-orm';
import { db } from '../client';
import { playlists, playlistItems, paths, pathItems } from '../schema';
import { loadAllScorableWorks, loadAllWorkContexts } from './library';
import { getProfile } from './profile';
import { generatePlaylist, type GeneratePlaylistOptions } from '../../engines/playlist/generate';
import { characterJourney, type LanePosition } from '../../engines/playlist/journey';
import { encodePlaylistShare, decodePlaylistShare, resolveSharedItems } from '../../util/playlistShare';
import { newId } from '../../util/id';
import type { Playlist, PlaylistOrigin } from '../../types/domain';

export interface PlaylistWithItems extends Playlist {
  items: Array<{ workId: string; title: string; position: number; status: 'none' | 'reading' | 'done' | 'dropped' }>;
}

export function listPlaylists(): PlaylistWithItems[] {
  const records = db.select().from(playlists).all();
  const allItems = db.select().from(playlistItems).all();
  const contexts = loadAllWorkContexts();
  const titleById = new Map(contexts.map((c) => [c.work.id, c.work.title]));
  const statusById = new Map(contexts.map((c) => [c.work.id, (c.library?.status ?? 'none') as PlaylistWithItems['items'][number]['status']]));

  return records
    .map((p) => ({
      ...p,
      createdBy: p.createdBy as PlaylistOrigin,
      items: allItems
        .filter((i) => i.playlistId === p.id)
        .sort((a, b) => a.position - b.position)
        .map((i) => ({
          workId: i.workId,
          title: titleById.get(i.workId) ?? i.workId,
          position: i.position,
          status: statusById.get(i.workId) ?? 'none',
        })),
    }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function getPlaylist(id: string): PlaylistWithItems | null {
  return listPlaylists().find((p) => p.id === id) ?? null;
}

export function createPlaylist(name: string, createdBy: PlaylistOrigin = 'user', sourceHint: string | null = null): Playlist {
  const now = new Date().toISOString();
  const id = newId();
  const record = { id, name, createdBy, sourceHint, createdAt: now, updatedAt: now };
  db.insert(playlists).values(record).run();
  return record;
}

export function renamePlaylist(id: string, name: string): void {
  db.update(playlists).set({ name, updatedAt: new Date().toISOString() }).where(eq(playlists.id, id)).run();
}

export function deletePlaylist(id: string): void {
  db.delete(playlistItems).where(eq(playlistItems.playlistId, id)).run();
  db.delete(playlists).where(eq(playlists.id, id)).run();
}

/** Appends at the end unless a position is given (for insert/reorder). */
export function addToPlaylist(playlistId: string, workId: string, position?: number): void {
  const existing = db.select().from(playlistItems).where(eq(playlistItems.playlistId, playlistId)).all();
  if (existing.some((i) => i.workId === workId)) return; // no duplicates
  const pos = position ?? (existing.length ? Math.max(...existing.map((i) => i.position)) + 1 : 0);
  db.insert(playlistItems).values({ playlistId, workId, position: pos, addedAt: new Date().toISOString() }).run();
  db.update(playlists).set({ updatedAt: new Date().toISOString() }).where(eq(playlists.id, playlistId)).run();
}

export function removeFromPlaylist(playlistId: string, workId: string): void {
  db.delete(playlistItems)
    .where(and(eq(playlistItems.playlistId, playlistId), eq(playlistItems.workId, workId)))
    .run();
  db.update(playlists).set({ updatedAt: new Date().toISOString() }).where(eq(playlists.id, playlistId)).run();
}

/** Reorders a playlist to exactly this workId sequence (drop = reorder = same op). */
export function reorderPlaylist(playlistId: string, orderedWorkIds: string[]): void {
  const existing = db.select().from(playlistItems).where(eq(playlistItems.playlistId, playlistId)).all();
  const addedAtByWork = new Map(existing.map((i) => [i.workId, i.addedAt]));
  db.delete(playlistItems).where(eq(playlistItems.playlistId, playlistId)).run();
  orderedWorkIds.forEach((workId, i) => {
    db.insert(playlistItems).values({
      playlistId, workId, position: i,
      addedAt: addedAtByWork.get(workId) ?? new Date().toISOString(),
    }).run();
  });
  db.update(playlists).set({ updatedAt: new Date().toISOString() }).where(eq(playlists.id, playlistId)).run();
}

/** "The app can make it for him" — generates a playlist from taste fit
 *  (+ optional mood/character seed) and persists it immediately, same as a
 *  hand-built one, so it's editable right away. */
export function generateAppPlaylist(name: string, options: GeneratePlaylistOptions): Playlist {
  const works = [...loadAllScorableWorks().values()];
  const profile = getProfile(new Date());
  const picks = generatePlaylist(works, profile, options);
  const sourceHint = options.seedName ?? options.mood ?? null;
  const playlist = createPlaylist(name, 'app', sourceHint);
  picks.forEach((pick, i) => {
    db.insert(playlistItems).values({
      playlistId: playlist.id, workId: pick.work.id, position: i, addedAt: playlist.createdAt,
    }).run();
  });
  return playlist;
}

function loadLanePositions(): Map<string, LanePosition> {
  const allPaths = db.select().from(paths).all();
  const allPathItems = db.select().from(pathItems).all();
  const pathKeyById = new Map(allPaths.map((p) => [p.id, p.pathKey]));
  const out = new Map<string, LanePosition>();
  for (const pi of allPathItems) {
    out.set(pi.workId, { bucket: pathKeyById.get(pi.pathId) ?? 'other', position: pi.position });
  }
  return out;
}

/** "Type a character's name, get their journey" — a linear, curated reading
 *  order through that character's essential books (see journey.ts for why
 *  this orders by lane position rather than by taste/score). Persisted
 *  immediately, same as any other playlist, so it's editable right away. */
export function generateCharacterJourneyPlaylist(name: string, characterName: string, count = 12): Playlist {
  const works = [...loadAllScorableWorks().values()];
  const positions = loadLanePositions();
  const picks = characterJourney(works, positions, characterName, count);
  const playlist = createPlaylist(name, 'app', characterName);
  picks.forEach((pick, i) => {
    db.insert(playlistItems).values({
      playlistId: playlist.id, workId: pick.work.id, position: i, addedAt: playlist.createdAt,
    }).run();
  });
  return playlist;
}

export function buildShareCode(playlistId: string): string | null {
  const playlist = getPlaylist(playlistId);
  if (!playlist) return null;
  return encodePlaylistShare(playlist.name, playlist.items.map((i) => ({ workId: i.workId, title: i.title })));
}

export interface ImportResult {
  playlist: Playlist | null;
  resolvedCount: number;
  unresolvedTitles: string[];
}

/** Decodes a pasted share code and creates a new local playlist from
 *  whatever resolves against this device's catalog. Titles that don't
 *  resolve (a book this install doesn't have yet) are reported, not
 *  silently dropped, so the receiver knows the import was partial. */
export function importSharedPlaylist(code: string): ImportResult {
  const payload = decodePlaylistShare(code);
  if (!payload) return { playlist: null, resolvedCount: 0, unresolvedTitles: [] };

  const contexts = loadAllWorkContexts();
  const catalogTitleById = new Map(contexts.map((c) => [c.work.id, c.work.title]));
  const { resolved, unresolved } = resolveSharedItems(payload.items, catalogTitleById);

  const playlist = createPlaylist(payload.name, 'user', 'shared');
  resolved.forEach((item, i) => {
    db.insert(playlistItems).values({
      playlistId: playlist.id, workId: item.workId, position: i, addedAt: playlist.createdAt,
    }).run();
  });
  return { playlist, resolvedCount: resolved.length, unresolvedTitles: unresolved.map((u) => u.title) };
}
