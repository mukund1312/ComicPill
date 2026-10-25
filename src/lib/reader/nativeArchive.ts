// Bridge to the local Android module in modules/comic-archive (junrar for RAR4, commons-compress
// for 7z). Absent on iOS and in Expo Go, so everything here degrades to a clear error.
import { requireOptionalNativeModule } from 'expo';
import { ComicOpenError } from './errors';

export type NativeKind = 'rar' | '7z';

type Native = {
  listEntries(path: string, kind: NativeKind): Promise<string[]>;
  extractEntry(path: string, kind: NativeKind, entry: string, dest: string): Promise<void>;
};

export function nativeArchive(kind: NativeKind): Native {
  const mod = requireOptionalNativeModule<Native>('ComicArchive');
  if (!mod) {
    throw new ComicOpenError(`${kind === 'rar' ? 'CBR' : 'CB7'} files need the Android development build of ComicPill. Re-save as CBZ to read it here.`);
  }
  return mod;
}

export const translateNativeError = (e: unknown): ComicOpenError => {
  const msg = e instanceof Error ? e.message : String(e);
  if (/RAR5/i.test(msg)) return new ComicOpenError('RAR5 archives are not supported yet. Re-save the comic as CBZ.');
  if (/password|encrypted/i.test(msg)) return new ComicOpenError('This archive is password-protected.');
  return new ComicOpenError('Could not read this archive — it may be corrupt.');
};
