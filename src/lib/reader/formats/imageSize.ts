// Reads width/height from the first bytes of an image, so page shapes can be known
// without decoding (used to spot double-page spreads and to lay out webtoon strips).
export type PageSize = { width: number; height: number };

const be16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const be32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const le16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const le24 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));

export function readImageSize(b: Uint8Array): PageSize | null {
  if (b.length < 12) return null;
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b.length >= 24) return { width: be32(b, 16), height: be32(b, 20) };
  // GIF
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { width: le16(b, 6), height: le16(b, 8) };
  // JPEG: walk markers to the first SOFn
  if (b[0] === 0xff && b[1] === 0xd8) {
    let p = 2;
    while (p + 9 < b.length) {
      if (b[p] !== 0xff) { p++; continue; }
      const marker = b[p + 1];
      if (marker === 0xff) { p++; continue; }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: be16(b, p + 5), width: be16(b, p + 7) };
      }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { p += 2; continue; }
      p += 2 + be16(b, p + 2);
    }
    return null;
  }
  // WebP
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP' && b.length >= 30) {
    const kind = ascii(b, 12, 4);
    if (kind === 'VP8X') return { width: le24(b, 24) + 1, height: le24(b, 27) + 1 };
    if (kind === 'VP8L') {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] * 16777216);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8 ') return { width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff };
  }
  return null;
}
