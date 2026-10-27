// Bridge to the local Android module in modules/comic-archive (junrar for RAR4, commons-compress
// for 7z). Absent on iOS and in Expo Go, so everything here degrades to a clear error.
import { requireOptionalNativeModule } from 'expo';
import { ComicOpenError } from './errors';

export type NativeKind = 'rar' | '7z';

type Native = {
  listEntries(path: string, kind: NativeKind): Promise<string[]>;
  extractEntry(path: string, kind: NativeKind, entry: string, dest: string): Promise<void>;
  /** [width, height] per entry, in one pass over the archive; [0, 0] when unreadable. */
  imageSizes(path: string, kind: NativeKind, entries: string[]): Promise<number[][]>;
  pdfPageSizes(path: string): Promise<number[][]>;
  renderPdfPage(path: string, index: number, dest: string, targetWidth: number): Promise<void>;
  grayThumbnail?(path: string, maxWidth: number): Promise<{ width: number; height: number; data: string }>;
  recognizeText?(path: string): Promise<string>;
  /** Keep access to a picked cloud file after the app closes. */
  persistUriPermission?(uri: string): boolean;
};

/** Optional: absent on iOS and in Expo Go, where guided view is simply unavailable. */
export const optionalNative = (): Native | null => requireOptionalNativeModule<Native>('ComicArchive');

const LABEL = { rar: 'CBR', '7z': 'CB7', pdf: 'PDF' } as const;

export function nativeArchive(kind: NativeKind | 'pdf'): Native {
  const mod = requireOptionalNativeModule<Native>('ComicArchive');
  if (!mod) {
    throw new ComicOpenError(`${LABEL[kind]} files need the Android development build of ComicPill${kind === 'pdf' ? '' : '. Re-save as CBZ to read it here'}.`);
  }
  return mod;
}

export const translateNativeError = (e: unknown): ComicOpenError => {
  const msg = e instanceof Error ? e.message : String(e);
  if (/RAR5/i.test(msg)) return new ComicOpenError('RAR5 archives are not supported yet. Re-save the comic as CBZ.');
  if (/password|encrypted/i.test(msg)) return new ComicOpenError('This archive is password-protected.');
  return new ComicOpenError('Could not read this archive — it may be corrupt.');
};
