// Fetching the cover picture of an online result, so the reader can keep it as their own cover. Only addresses on the allowed hosts are ever fetched.
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { Directory, File, Paths } from 'expo-file-system';
import { isAllowedCoverUrl } from './online';

/** Download a cover and return where it is, or null if there isn't one (a missing cover comes back as an error or as a tiny placeholder). */
export async function downloadCover(url: string): Promise<string | null> {
  if (!isAllowedCoverUrl(url)) return null;
  try {
    const dir = new Directory(Paths.cache, 'online-covers');
    if (!dir.exists) dir.create({ intermediates: true });
    const file = await File.downloadFileAsync(url, dir, { idempotent: true });
    if (!file.exists || (file.size ?? 0) < 2048) { try { file.delete(); } catch { /* it is in the cache */ } return null; }
    return file.uri;
  } catch { return null; }
}
