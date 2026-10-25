import { describe, expect, it } from 'vitest';
import { naturalSort } from './naturalSort';
import { detectKind } from './detect';
import { selectImageEntries } from './entries';
import { findImageRef, parseContainer, parseOpf, resolvePath } from './epub';

describe('naturalSort', () => {
  it('orders page2 before page10', () => {
    expect(naturalSort(['page10.jpg', 'page2.jpg', 'page1.jpg'])).toEqual(['page1.jpg', 'page2.jpg', 'page10.jpg']);
  });
});

describe('detectKind', () => {
  it('reads magic bytes, not extensions', () => {
    expect(detectKind(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0]))).toBe('zip');
    expect(detectKind(Uint8Array.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00, 0]))).toBe('rar4');
    expect(detectKind(Uint8Array.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]))).toBe('rar5');
    expect(detectKind(Uint8Array.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]))).toBe('sevenzip');
    expect(detectKind(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe('pdf');
    expect(detectKind(Uint8Array.from([1, 2, 3, 4]))).toBe('unknown');
  });
});

describe('selectImageEntries', () => {
  it('skips junk and non-images, recurses folders, sorts naturally', () => {
    expect(selectImageEntries([
      '__MACOSX/._page1.jpg', '.DS_Store', 'ch/', 'ch/page10.JPG', 'ch/page2.jpg', 'ComicInfo.xml', 'ch/.hidden.png', 'ch/page1.webp',
    ])).toEqual(['ch/page1.webp', 'ch/page2.jpg', 'ch/page10.JPG']);
  });
});

describe('epub', () => {
  it('walks container → opf → spine → image', () => {
    expect(parseContainer('<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="x"/></rootfiles></container>')).toBe('OEBPS/content.opf');
    const opf = parseOpf(`<package><manifest><item id="p1" href="text/p1.xhtml" media-type="application/xhtml+xml"/><item id="i1" href="img/a%20b.jpg" media-type="image/jpeg"/></manifest><spine><itemref idref="p1"/></spine></package>`);
    expect(opf.spine).toEqual(['p1']);
    expect(opf.manifest.i1.href).toBe('img/a b.jpg');
    expect(findImageRef('<body><img alt="" src="../img/a%20b.jpg"/></body>')).toBe('../img/a b.jpg');
    expect(findImageRef('<svg><image width="1" xlink:href="../img/c.png"/></svg>')).toBe('../img/c.png');
    expect(findImageRef('<p>text</p>')).toBeNull();
    expect(resolvePath('OEBPS/text/p1.xhtml', '../img/a b.jpg')).toBe('OEBPS/img/a b.jpg');
  });
});
