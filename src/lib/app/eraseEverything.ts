// Start over from nothing: every comic, collection, rating, setting and saved login goes, and the next launch is a first run.
import AsyncStorage from '@react-native-async-storage/async-storage';
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { Directory, Paths } from 'expo-file-system';
import { sqlite } from '../db/client';
import { listServers, removeServer } from '../opds/servers';
import { cacheRoot } from '../reader/cloudCache';

/**
 * Deletes everything ComicPill keeps. Nothing in the cloud is touched: Drive and your comic server keep their files.
 * The app must be closed and opened again afterwards, so no screen writes old state back.
 */
export async function eraseEverything(): Promise<void> {
  // Saved server logins live in the keychain, which survives even deleting the app, so they are removed one by one.
  for (const server of listServers()) { try { await removeServer(server.id); } catch { /* the entry goes with the settings below */ } }

  // Files: imported comics, covers, downloads, drafts and temporary files. The database folder is left for the database step.
  const clear = (dir: Directory, keep: string[] = []) => {
    try { if (dir.exists) for (const entry of dir.list()) { if (!keep.includes(entry.name)) { try { entry.delete(); } catch { /* skipped; the database step still runs */ } } } } catch { /* nothing to list */ }
  };
  try { cacheRoot().delete(); } catch { /* not there */ }
  clear(Paths.document, ['SQLite']);
  clear(Paths.cache);

  // Every table, so the catalog is seeded again from the start on the next launch.
  const tables = sqlite.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").map((t) => t.name);
  sqlite.execSync('PRAGMA foreign_keys = OFF');
  sqlite.withTransactionSync(() => { for (const name of tables) sqlite.execSync(`DELETE FROM "${name.replace(/"/g, '""')}"`); });
  sqlite.execSync('PRAGMA foreign_keys = ON');

  // Settings, theme, onboarding progress and the rest.
  await AsyncStorage.clear();
}
