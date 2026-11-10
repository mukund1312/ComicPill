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
  /** Speech balloons found by an on-device neural detector: boxes as fractions of the image; c 0 = balloon, 1 = text in a balloon, 2 = lettering outside one. */
  detectBubbles?(path: string, minScore: number): Promise<Array<{ c: number; s: number; x: number; y: number; w: number; h: number }>>;
  /** Every line of text on an image with its box (fractions of the image, origin top left). Reading order is worked out in JavaScript. */
  recognizeLines?(path: string): Promise<{ text: string; x: number; y: number; w: number; h: number; conf?: number }[]>;
  /** iOS 17.4+: show Apple's on-device translation sheet for `text`. Resolves false when it can't be shown. */
  translateText?(text: string): Promise<boolean>;
  /** Keep access to a picked cloud file after the app closes. */
  persistUriPermission?(uri: string): boolean;
  /** iOS: the Files picker opening files in place (no copy), so it returns at once. `bookmark` reopens the file later. Empty when cancelled. */
  excludeFromBackup?(path: string): void;
  pickFolderInPlace?(): Promise<{ uri: string; name: string; size: number; bookmark: string | null }[]>;
  listFolderComics?(bookmark: string, extensions: string[], maxDepth: number): Promise<{ path: string[]; name: string; size: number }[]>;
  pickFilesInPlace?(): Promise<{ uri: string; name: string; size: number; bookmark: string | null }[]>;
  /** iOS: a base64 bookmark that reopens a picked cloud file later. */
  makeBookmark?(uri: string): string | null;
  /** iOS: copy a bookmarked file (or a file `relative`ly inside a bookmarked folder) to `dest`, downloading it from the cloud app if needed. */
  copyFromBookmark?(bookmark: string, dest: string, relative: string): Promise<void>;
};

/** Optional: absent on iOS and in Expo Go, where guided view is simply unavailable. */
export const optionalNative = (): Native | null => requireOptionalNativeModule<Native>('ComicArchive');

const LABEL = { rar: 'CBR', '7z': 'CB7', pdf: 'PDF' } as const;

export function nativeArchive(kind: NativeKind | 'pdf'): Native {
  const mod = requireOptionalNativeModule<Native>('ComicArchive');
  if (!mod) {
    throw new ComicOpenError(`${LABEL[kind]} files need the full ComicPill app (not Expo Go)${kind === 'pdf' ? '' : '. Re-save as CBZ to read it here'}.`);
  }
  return mod;
}

export const translateNativeError = (e: unknown): ComicOpenError => {
  const msg = e instanceof Error ? e.message : String(e);
  if (__DEV__ || /7z:/.test(msg)) console.warn('archive error:', msg.slice(0, 300));
  if (/RAR5/i.test(msg)) return new ComicOpenError('RAR5 archives are not supported on Android yet. Re-save the comic as CBZ.');
  if (/password|encrypted/i.test(msg)) return new ComicOpenError('This archive is password-protected.');
  return new ComicOpenError(`Could not read this archive — it may be corrupt. [${msg.slice(-240)}]`);
};
