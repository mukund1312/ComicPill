import { optionalNative } from '../../reader/nativeArchive';

/** Text on the screenshot, read on this phone (ML Kit). null = this build can't, so the caller must ask the reader first. */
export async function recognizeText(uri: string): Promise<string | null> {
  const native = optionalNative();
  if (!native?.recognizeText) return null;
  try { return await native.recognizeText(uri); } catch { return null; }
}
