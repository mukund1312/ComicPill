export type ArchiveKind = 'zip' | 'rar4' | 'rar5' | 'sevenzip' | 'pdf' | 'unknown';

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);

/** Sniff the real container from magic bytes — many ".cbr" files are really zips. */
export function detectKind(head: Uint8Array): ArchiveKind {
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06])) return 'zip';
  if (startsWith(head, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00])) return 'rar5';
  if (startsWith(head, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00])) return 'rar4';
  if (startsWith(head, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return 'sevenzip';
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46])) return 'pdf';
  return 'unknown';
}
