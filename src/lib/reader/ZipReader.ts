// Random-access zip reader. Only the directory and the requested entry are read from disk,
// so a 2 GB archive costs the same memory as a 20 MB one. This is the "streaming reader".
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { File, FileMode, type FileHandle } from 'expo-file-system';
import { Inflate, inflateSync } from 'fflate';
import { ComicOpenError } from './errors';
import { localHeaderLength, parseCentralDirectory, parseEocd, parseZip64Eocd, parseZip64Locator, type ZipEntry } from './formats/zipIndex';

const TAIL_BYTES = 65557 + 20 + 56; // max comment + zip64 locator + slack

export class ZipReader {
  readonly entries: ZipEntry[];
  private byName = new Map<string, ZipEntry>();

  private constructor(private handle: FileHandle, entries: ZipEntry[]) {
    this.entries = entries;
    for (const e of entries) this.byName.set(e.name, e);
  }

  static open(file: File): ZipReader {
    const handle = file.open(FileMode.ReadOnly);
    try {
      const size = handle.size ?? 0;
      const tailStart = Math.max(0, size - TAIL_BYTES);
      handle.offset = tailStart;
      const tail = handle.readBytes(size - tailStart);
      const eocd = parseEocd(tail);
      if (!eocd) throw new ComicOpenError('This file is corrupt or not a valid archive.');
      let { cdOffset, cdSize } = eocd;
      if (eocd.needsZip64) {
        const at = parseZip64Locator(tail, eocd.eocdIndex);
        if (at == null) throw new ComicOpenError('This file is corrupt or not a valid archive.');
        handle.offset = at;
        const z = parseZip64Eocd(handle.readBytes(56));
        if (!z) throw new ComicOpenError('This file is corrupt or not a valid archive.');
        cdOffset = z.cdOffset; cdSize = z.cdSize;
      }
      handle.offset = cdOffset;
      return new ZipReader(handle, parseCentralDirectory(handle.readBytes(cdSize)));
    } catch (e) {
      handle.close();
      throw e instanceof ComicOpenError ? e : new ComicOpenError('This file is corrupt or not a valid archive.');
    }
  }

  has(name: string) { return this.byName.has(name); }
  names() { return this.entries.map((e) => e.name); }

  /** Compressed bytes of an entry (at most `limit` of them) plus its method. */
  private raw(name: string, limit: number): { bytes: Uint8Array; entry: ZipEntry } {
    const entry = this.byName.get(name);
    if (!entry) throw new ComicOpenError(`"${name}" is missing from the archive.`);
    if (entry.encrypted) throw new ComicOpenError('This archive is password-protected.');
    if (entry.method !== 0 && entry.method !== 8) throw new ComicOpenError('This archive uses an unsupported compression method.');
    // Local header = 30 fixed bytes + name + extra; read enough to find where the data starts.
    this.handle.offset = entry.headerOffset;
    const header = this.handle.readBytes(Math.min(30 + 65535 * 2, (this.handle.size ?? 0) - entry.headerOffset));
    const dataStart = entry.headerOffset + (localHeaderLength(header) ?? 30);
    this.handle.offset = dataStart;
    return { bytes: this.handle.readBytes(Math.min(entry.compressedSize, limit)), entry };
  }

  readEntry(name: string): Uint8Array {
    try {
      const { bytes, entry } = this.raw(name, Number.MAX_SAFE_INTEGER);
      return entry.method === 0 ? bytes : inflateSync(bytes);
    } catch (e) {
      throw e instanceof ComicOpenError ? e : new ComicOpenError(`Could not read "${name}" — the file may be corrupt.`);
    }
  }

  /** First `maxBytes` of compressed data, inflated as far as it goes — enough for an image header. */
  readEntryHead(name: string, maxBytes = 49152): Uint8Array {
    const { bytes, entry } = this.raw(name, maxBytes);
    if (entry.method === 0) return bytes;
    const chunks: Uint8Array[] = [];
    const inflater = new Inflate((c) => { chunks.push(c); });
    try { inflater.push(bytes, false); } catch { /* truncated input is expected */ }
    const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0)); let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  close() { try { this.handle.close(); } catch { /* already closed */ } }
}
