import { describe, expect, it } from 'vitest';
import { normalizeIsbn, validateManual } from './manual';
import { afterImport, expiryFor, isExpired } from './draftModel';

describe('normalizeIsbn', () => {
  it('accepts a valid ISBN-13 with hyphens, and converts a valid ISBN-10', () => {
    expect(normalizeIsbn('978-1-4012-3042-5')).toBe('9781401230425');
    expect(normalizeIsbn('1401230423')).toBe('9781401230425');
  });
  it('rejects a wrong checksum or the wrong length', () => {
    expect(normalizeIsbn('9781401230422')).toBeNull();
    expect(normalizeIsbn('12345')).toBeNull();
  });
});

describe('validateManual', () => {
  it('needs only a title', () => {
    const r = validateManual({ title: '  Batman:   Hush ' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ title: 'Batman: Hush', printing: 'trade_paperback', format: 'physical', series: null, isbn13: null, year: null });
  });
  it('rejects a missing title and bad optional fields, each with its own message', () => {
    const r = validateManual({ title: ' ', year: '1492', isbn: '123', pages: 'many' }, 2026);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['isbn', 'pages', 'title', 'year']);
  });
  it('keeps writer and artist as creators', () => {
    const r = validateManual({ title: 'Hush', writer: 'Jeph Loeb', artist: 'Jim Lee', year: '2003', printing: 'hardcover' });
    expect(r.ok && r.value.creators).toEqual(['Jeph Loeb', 'Jim Lee']);
  });
});

describe('shelf photo retention', () => {
  it('removes the photo after import unless the reader chose to keep it, and never past a week', () => {
    expect(afterImport(false)).toBe('delete');
    expect(afterImport(true)).toBe('keep');
    const now = 1_000_000;
    expect(isExpired(expiryFor(now), now)).toBe(false);
    expect(isExpired(expiryFor(now), now + 7 * 86_400_000)).toBe(true);
  });
});
