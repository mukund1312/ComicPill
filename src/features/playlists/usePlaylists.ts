import { useCallback, useMemo, useState } from 'react';
import {
  listPlaylists, createPlaylist, renamePlaylist, deletePlaylist,
  addToPlaylist, removeFromPlaylist, reorderPlaylist, generateAppPlaylist,
  buildShareCode, importSharedPlaylist,
} from '../../lib/db/queries/playlists';

export function usePlaylists() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [version, setVersion] = useState(0); // bumped after every write to re-run the query
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const data = useMemo(() => listPlaylists(), [version]);
  const selected = data.find((p) => p.id === selectedId) ?? null;

  const create = useCallback((name: string) => {
    const p = createPlaylist(name, 'user');
    refresh();
    setSelectedId(p.id);
    return p;
  }, [refresh]);

  const generateForMe = useCallback((name: string, mood?: string | null, seedName?: string | null, count = 8) => {
    const p = generateAppPlaylist(name, { mood, seedName, count });
    refresh();
    setSelectedId(p.id);
    return p;
  }, [refresh]);

  const rename = useCallback((id: string, name: string) => { renamePlaylist(id, name); refresh(); }, [refresh]);
  const remove = useCallback((id: string) => {
    deletePlaylist(id);
    if (selectedId === id) setSelectedId(null);
    refresh();
  }, [refresh, selectedId]);

  const addItem = useCallback((playlistId: string, workId: string) => { addToPlaylist(playlistId, workId); refresh(); }, [refresh]);
  const removeItem = useCallback((playlistId: string, workId: string) => { removeFromPlaylist(playlistId, workId); refresh(); }, [refresh]);
  const reorder = useCallback((playlistId: string, orderedWorkIds: string[]) => { reorderPlaylist(playlistId, orderedWorkIds); refresh(); }, [refresh]);

  const share = useCallback((playlistId: string) => buildShareCode(playlistId), []);
  const importFromCode = useCallback((code: string) => {
    const result = importSharedPlaylist(code);
    if (result.playlist) { refresh(); setSelectedId(result.playlist.id); }
    return result;
  }, [refresh]);

  return {
    playlists: data, selected, select: setSelectedId,
    create, generateForMe, rename, remove,
    addItem, removeItem, reorder,
    share, importFromCode,
  };
}
