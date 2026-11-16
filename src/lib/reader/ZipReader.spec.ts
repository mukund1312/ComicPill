import { describe, expect, it, vi } from 'vitest';
import { inflateSync, zipSync } from 'fflate';

// An in-memory stand-in for expo-file-system: a "file" is a byte array, and a handle reads from it at `offset`.
const disk = new Map<string, Uint8Array>();
vi.mock('expo-file-system', () => {
  class Handle {
    offset = 0;
    constructor(private bytes: Uint8Array) {}
    get size() { return this.bytes.length; }
    readBytes(n: number) { const out = this.bytes.slice(this.offset, this.offset + n); this.offset += out.length; return out; }
    close() {}
  }
  class File {
    constructor(public uri: string) {}
    open() { return new Handle(disk.get(this.uri)!); }
  }
  return { File, FileMode: { ReadOnly: 0, WriteOnly: 1 } };
});

const { ZipReader } = await import('./ZipReader');
const { File } = await import('expo-file-system');

function bytes(n: number, seed: number) {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * seed + (i >> 3)) & 255;
  return out;
}

describe('ZipReader', () => {
  // A long name and an extra field make the local header longer than 30 bytes, which the reader must skip exactly.
  const stored = bytes(5000, 7);
  const packed = new Uint8Array(20000).fill(65); // compresses well
  const zip = zipSync({
    'pages/a-very-long-folder-name/page-001.jpg': [stored, { level: 0 }],
    'pages/page-002.png': [packed, { level: 9 }],
  });
  disk.set('mem://comic.cbz', zip);
  const reader = ZipReader.open(new File('mem://comic.cbz') as never);

  it('reads stored and deflated entries back exactly', () => {
    expect(reader.readEntry('pages/a-very-long-folder-name/page-001.jpg')).toEqual(stored);
    expect(reader.readEntry('pages/page-002.png')).toEqual(packed);
  });

  it('reads the start of an entry for its image header', () => {
    expect(reader.readEntryHead('pages/a-very-long-folder-name/page-001.jpg', 64)).toEqual(stored.slice(0, 64));
  });

  it('says where an entry’s data is, so native code can unpack the same bytes', () => {
    const a = reader.span('pages/a-very-long-folder-name/page-001.jpg')!;
    expect(a.method).toBe(0);
    expect(zip.slice(a.offset, a.offset + a.size)).toEqual(stored);
    const b = reader.span('pages/page-002.png')!;
    expect(b.method).toBe(8);
    expect(inflateSync(zip.slice(b.offset, b.offset + b.size))).toEqual(packed);
    expect(reader.span('missing.jpg')).toBeNull();
  });
});
