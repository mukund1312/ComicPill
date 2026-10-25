// Parses a zip's directory without loading the archive: the reader reads only the tail
// (end-of-central-directory), then the central directory, then one entry at a time.
export type ZipEntry = {
  name: string;
  method: number; // 0 = stored, 8 = deflate
  compressedSize: number;
  size: number;
  headerOffset: number;
  encrypted: boolean;
};

export type Eocd = { entryCount: number; cdSize: number; cdOffset: number; needsZip64: boolean; eocdIndex: number };

const u16 = (v: DataView, o: number) => v.getUint16(o, true);
const u32 = (v: DataView, o: number) => v.getUint32(o, true);
const u64 = (v: DataView, o: number) => v.getUint32(o, true) + v.getUint32(o + 4, true) * 4294967296;
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

/** Finds the EOCD record in the tail of the file (scans backwards past any trailing comment). */
export function parseEocd(tail: Uint8Array): Eocd | null {
  const v = view(tail);
  for (let i = tail.length - 22; i >= 0; i--) {
    if (u32(v, i) !== 0x06054b50) continue;
    const entryCount = u16(v, i + 10); const cdSize = u32(v, i + 12); const cdOffset = u32(v, i + 16);
    const needsZip64 = entryCount === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff;
    return { entryCount, cdSize, cdOffset, needsZip64, eocdIndex: i };
  }
  return null;
}

/** Offset of the zip64 EOCD record, read from the locator that sits just before the EOCD. */
export function parseZip64Locator(tail: Uint8Array, eocdIndex: number): number | null {
  const at = eocdIndex - 20; if (at < 0) return null;
  const v = view(tail);
  return u32(v, at) === 0x07064b50 ? u64(v, at + 8) : null;
}

export function parseZip64Eocd(record: Uint8Array): { entryCount: number; cdSize: number; cdOffset: number } | null {
  const v = view(record);
  if (record.length < 56 || u32(v, 0) !== 0x06064b50) return null;
  return { entryCount: u64(v, 32), cdSize: u64(v, 40), cdOffset: u64(v, 48) };
}

const decoder = new TextDecoder();

export function parseCentralDirectory(cd: Uint8Array): ZipEntry[] {
  const v = view(cd); const entries: ZipEntry[] = [];
  let p = 0;
  while (p + 46 <= cd.length && u32(v, p) === 0x02014b50) {
    const flags = u16(v, p + 8); const method = u16(v, p + 10);
    let compressedSize = u32(v, p + 20); let size = u32(v, p + 24);
    const nameLen = u16(v, p + 28); const extraLen = u16(v, p + 30); const commentLen = u16(v, p + 32);
    let headerOffset = u32(v, p + 42);
    const name = decoder.decode(cd.subarray(p + 46, p + 46 + nameLen));
    // zip64 extra field: only the fields that were 0xFFFFFFFF are present, in this order.
    let x = p + 46 + nameLen; const xEnd = x + extraLen;
    while (x + 4 <= xEnd) {
      const id = u16(v, x); const len = u16(v, x + 2);
      if (id === 0x0001) {
        let q = x + 4;
        if (size === 0xffffffff) { size = u64(v, q); q += 8; }
        if (compressedSize === 0xffffffff) { compressedSize = u64(v, q); q += 8; }
        if (headerOffset === 0xffffffff) { headerOffset = u64(v, q); }
      }
      x += 4 + len;
    }
    entries.push({ name, method, compressedSize, size, headerOffset, encrypted: (flags & 1) !== 0 });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Size of the local file header, so the reader knows where the entry's data starts. */
export function localHeaderLength(header: Uint8Array): number | null {
  const v = view(header);
  return header.length >= 30 && u32(v, 0) === 0x04034b50 ? 30 + u16(v, 26) + u16(v, 28) : null;
}
