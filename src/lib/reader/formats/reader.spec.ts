import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { localHeaderLength, parseCentralDirectory, parseEocd } from './zipIndex';
import { readImageSize } from './imageSize';
import { buildUnits, unitIndexOf } from './spreads';

describe('zipIndex', () => {
  it('lists entries from the tail + central directory without touching entry data', () => {
    const zip = zipSync({ 'a/p1.jpg': [strToU8('x'.repeat(100)), { level: 0 }], 'a/p2.jpg': strToU8('y'.repeat(500)) });
    const eocd = parseEocd(zip.subarray(Math.max(0, zip.length - 1000)));
    expect(eocd).not.toBeNull();
    const tailStart = Math.max(0, zip.length - 1000);
    expect(eocd!.cdOffset + eocd!.cdSize).toBe(tailStart + eocd!.eocdIndex);
    const entries = parseCentralDirectory(zip.subarray(eocd!.cdOffset, eocd!.cdOffset + eocd!.cdSize));
    expect(entries.map((e) => e.name)).toEqual(['a/p1.jpg', 'a/p2.jpg']);
    expect(entries[0].method).toBe(0); expect(entries[1].method).toBe(8);
    const e = entries[0];
    const start = e.headerOffset + localHeaderLength(zip.subarray(e.headerOffset, e.headerOffset + 64))!;
    expect(Array.from(zip.subarray(start, start + e.compressedSize))).toEqual(Array.from(strToU8('x'.repeat(100))));
  });
});

describe('readImageSize', () => {
  it('reads PNG', () => {
    const b = new Uint8Array(24); b.set([0x89, 0x50, 0x4e, 0x47]); new DataView(b.buffer).setUint32(16, 800); new DataView(b.buffer).setUint32(20, 1200);
    expect(readImageSize(b)).toEqual({ width: 800, height: 1200 });
  });
  it('reads JPEG past an APP0 segment', () => {
    const b = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 8, 0x07, 0xd0, 0x05, 0xdc, 3, 0, 0, 0, 0]);
    expect(readImageSize(b)).toEqual({ width: 1500, height: 2000 });
  });
  it('returns null for unknown data', () => { expect(readImageSize(new Uint8Array(32))).toBeNull(); });
});

describe('buildUnits', () => {
  const tall = { width: 100, height: 150 }; const wide = { width: 300, height: 150 };
  it('is one page per unit in single mode', () => { expect(buildUnits([tall, tall, tall], false)).toEqual([[0], [1], [2]]); });
  it('keeps the cover alone, pairs the rest, keeps wide pages alone', () => {
    expect(buildUnits([tall, tall, tall, wide, tall, tall, tall], true)).toEqual([[0], [1, 2], [3], [4, 5], [6]]);
  });
  it('does not pair a page with a following wide page', () => { expect(buildUnits([tall, tall, wide], true)).toEqual([[0], [1], [2]]); });
  it('finds the unit holding a page', () => { expect(unitIndexOf([[0], [1, 2], [3]], 2)).toBe(1); });
});
