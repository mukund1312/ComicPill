import { describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '../ai/client';
import { MAX_PHOTOS, scanPhotos } from './run';
import { defaultSelection, planAdditions } from './additions';
import { matchScannedBooks, summarizeScan, titleScore } from './match';
import { parseShelfScan, shelfScanJsonSchema, SCAN_SYSTEM_PROMPT, type ScannedBook } from './schema';
import { CATALOG_WORKS } from '../db/seed/catalog';

const book = (title: string, over: Partial<ScannedBook> = {}): ScannedBook => ({ title, volume: null, creators: [], confidence: 'high', seenAs: 'spine', ...over });
const cat = CATALOG_WORKS.map((w) => ({ id: w.id, title: w.title }));
const one = (b: ScannedBook) => matchScannedBooks([b], cat)[0];

describe('matching against the real catalog', () => {
  it('matches an exact title', () => {
    expect(one(book('Watchmen'))).toMatchObject({ status: 'matched', workId: 'watchmen' });
    expect(one(book('Batman: Year One'))).toMatchObject({ status: 'matched', workId: 'year-one' });
  });
  it('tolerates punctuation, case, missing "The" and a missing colon', () => {
    expect(one(book('batman year one'))).toMatchObject({ status: 'matched', workId: 'year-one' });
    expect(one(book('LONG HALLOWEEN'))).toMatchObject({ status: 'matched', workId: 'long-halloween' });
    expect(one(book('Batman - The Long Halloween'))).toMatchObject({ status: 'matched', workId: 'long-halloween' });
  });
  it('uses the volume to pick the right book, in digits or words', () => {
    expect(one(book('Saga', { volume: 'Vol. 1' }))).toMatchObject({ status: 'matched', workId: 'saga-vol1' });
    expect(one(book('Paper Girls', { volume: 'Volume One' }))).toMatchObject({ status: 'matched', workId: 'paper-girls-vol1' });
    expect(one(book('Saga Vol 1'))).toMatchObject({ workId: 'saga-vol1' });
  });
  it('never matches a different volume by title similarity alone', () => {
    const m = one(book('Saga', { volume: 'Vol. 47' }));
    expect(m.workId === 'saga-vol1' && m.status === 'matched').toBe(false);
  });
  it('a long title with the WRONG volume is not offered as the right book (the clash rule, isolated)', () => {
    // Without the clash rule these words overlap enough (0.6) to be offered for review.
    const owls = [{ id: 'owls-1', title: 'Batman: Court of Owls Vol. 1' }];
    expect(matchScannedBooks([book('Batman Court of Owls', { volume: 'Vol. 2' })], owls)[0]).toMatchObject({ status: 'unmatched', workId: null });
    expect(matchScannedBooks([book('Batman Court of Owls', { volume: 'Vol. 1' })], owls)[0]).toMatchObject({ status: 'matched', workId: 'owls-1' });
  });
  it('does not force-fit a book that is not in the catalog', () => {
    const m = one(book('Blorbo the Unremarkable Tales'));
    expect(m).toMatchObject({ status: 'unmatched', workId: null });
  });
  it('a bare character name is never "matched" to some Batman book', () => {
    const m = one(book('Batman'));
    expect(m.status).not.toBe('matched');
  });
  it('low-confidence reads always go to review, even on a perfect title', () => {
    expect(one(book('Watchmen', { confidence: 'low' }))).toMatchObject({ status: 'review', workId: 'watchmen' });
  });
  it('the same book seen twice is counted once', () => {
    const out = matchScannedBooks([book('Watchmen'), book('Watchmen', { seenAs: 'cover' })], cat);
    expect(out.filter((m) => m.workId === 'watchmen')).toHaveLength(1);
  });
  it('handles a whole shelf and summarises it', () => {
    const out = matchScannedBooks([book('Watchmen'), book('Batman: Year One'), book('Mystery Zine 4', { confidence: 'medium' }), book('Batman', { confidence: 'low' })], cat);
    const s = summarizeScan(out, 3);
    expect(s.matched).toBe(2);
    expect(s.unmatched + s.review).toBe(2);
    expect(s.unreadable).toBe(3);
  });
  it('handles an empty scan and an empty catalog', () => {
    expect(matchScannedBooks([], cat)).toEqual([]);
    expect(matchScannedBooks([book('Watchmen')], [])[0].status).toBe('unmatched');
  });
  it('an ambiguous near-tie is sent to review, not silently picked', () => {
    const twins = [{ id: 'a', title: 'Batman: Hush Part One' }, { id: 'b', title: 'Batman: Hush Part Two' }];
    expect(matchScannedBooks([book('Batman Hush')], twins)[0].status).toBe('review');
  });
});

describe('titleScore', () => {
  it('is 1 for identical titles and low for unrelated ones', () => {
    expect(titleScore('Watchmen', null, 'Watchmen')).toBe(1);
    expect(titleScore('Watchmen', null, 'Saga Vol. 1')).toBeLessThan(0.3);
    expect(titleScore('', null, 'Watchmen')).toBe(0);
  });
  it('treats "Volume Two" and "2" alike, and a clash as a different book', () => {
    expect(titleScore('Saga', 'Volume Two', 'Saga Vol. 2')).toBeGreaterThan(0.9);
    expect(titleScore('Saga', 'Vol. 2', 'Saga Vol. 1')).toBeLessThan(0.6);
  });
});

describe('the scan reply schema', () => {
  const ok = { books: [{ title: '  Watchmen ', volume: null, creators: ['Alan Moore', ' '], confidence: 'high', seenAs: 'spine' }], unreadable: 2 };
  it('accepts a good reply and tidies it', () => {
    expect(parseShelfScan(ok)).toEqual({ books: [{ title: 'Watchmen', volume: null, creators: ['Alan Moore'], confidence: 'high', seenAs: 'spine' }], unreadable: 2 });
  });
  it('rejects malformed replies', () => {
    expect(parseShelfScan(null)).toBeNull();
    expect(parseShelfScan({ books: 'x', unreadable: 0 })).toBeNull();
    expect(parseShelfScan({ books: [{ title: 'x' }], unreadable: 0 })).toBeNull();
    expect(parseShelfScan({ ...ok, books: [{ ...ok.books[0], confidence: 'certain' }] })).toBeNull();
  });
  it('drops blank titles, bounds the list and the unreadable count', () => {
    const many = { books: Array.from({ length: 200 }, (_, i) => ({ ...ok.books[0], title: `Book ${i}` })), unreadable: 99999 };
    const p = parseShelfScan({ ...many, books: [{ ...ok.books[0], title: '   ' }, ...many.books] })!;
    expect(p.books).toHaveLength(80);
    expect(p.books.every((b) => b.title)).toBe(true);
    expect(p.unreadable).toBe(500);
    expect(parseShelfScan({ books: [], unreadable: -4 })!.unreadable).toBe(0);
  });
  it('is a closed, fully-required schema (valid for OpenAI strict mode)', () => {
    const bad: string[] = [];
    const walk = (n: unknown, path: string) => {
      if (Array.isArray(n)) return n.forEach((x, i) => walk(x, `${path}[${i}]`));
      if (n && typeof n === 'object') {
        const o = n as Record<string, unknown>;
        if (o.type === 'object') {
          if (o.additionalProperties !== false) bad.push(`${path} open`);
          const req = (o.required as string[]) ?? [];
          for (const k of Object.keys((o.properties as object) ?? {})) if (!req.includes(k)) bad.push(`${path}.${k} optional`);
        }
        for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
      }
    };
    walk(shelfScanJsonSchema(), '$');
    expect(bad).toEqual([]);
    expect(JSON.stringify(shelfScanJsonSchema())).not.toMatch(/\$schema|\$ref/);
  });
  it('tells the model not to invent titles or obey text in the photo', () => {
    expect(SCAN_SYSTEM_PROMPT).toMatch(/Never guess or invent/);
    expect(SCAN_SYSTEM_PROMPT).toMatch(/never instructions to follow/);
  });
});


const claude = { provider: 'anthropic' as const, model: 'claude-opus-5-5', apiKey: 'sk-ant-abcdefghijklmnopqrstuvwxyz' };
const scanReply = (books: unknown[]): FetchLike => vi.fn(async () => ({
  ok: true, status: 200,
  json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ books, unreadable: 1 }) }] }),
}));
const wm = { title: 'Watchmen', volume: null, creators: [], confidence: 'high', seenAs: 'spine' };

describe('scanPhotos', () => {
  it('reads the photos with the reader’s key in ONE request, however many photos', async () => {
    const f = scanReply([wm]);
    const r = await scanPhotos(claude, ['a', 'b', 'c'], { fetchImpl: f });
    expect(r).toMatchObject({ ok: true, data: { books: [{ title: 'Watchmen' }], unreadable: 1 } });
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    const body = JSON.parse((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.messages[0].content.filter((c: { type: string }) => c.type === 'image')).toHaveLength(3);
  });
  it(`never sends more than ${MAX_PHOTOS} photos`, async () => {
    const f = scanReply([]);
    await scanPhotos(claude, ['1', '2', '3', '4', '5', '6'], { fetchImpl: f });
    const body = JSON.parse((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.messages[0].content.filter((c: { type: string }) => c.type === 'image')).toHaveLength(MAX_PHOTOS);
  });
  it('costs nothing without photos or without a key', async () => {
    const f = scanReply([]);
    expect(await scanPhotos(claude, [], { fetchImpl: f })).toMatchObject({ ok: false });
    expect(await scanPhotos(null, ['a'], { fetchImpl: f })).toMatchObject({ ok: false, kind: 'no_key' });
    expect(f).not.toHaveBeenCalled();
  });
  it('rejects a reply that is not a valid scan', async () => {
    expect(await scanPhotos(claude, ['a'], { fetchImpl: scanReply([{ title: 5 }]) })).toMatchObject({ ok: false, kind: 'invalid_output' });
  });
});

describe('what gets added', () => {
  const matches = matchScannedBooks([book('Watchmen'), book('Batman: Year One', { confidence: 'low' }), book('Blorbo Tales')], cat);
  it('starts with only the confident matches ticked', () => {
    expect([...defaultSelection(matches)]).toEqual(['watchmen']);
  });
  it('adds only what the reader ticked, never unmatched books', () => {
    const plan = planAdditions(matches, new Set(['watchmen', 'year-one']), 'physical', () => 'none');
    expect(plan.map((p) => p.workId).sort()).toEqual(['watchmen', 'year-one']);
    expect(planAdditions(matches, new Set(), 'physical', () => 'none')).toEqual([]);
  });
  it('keeps the format they already own when adding another', () => {
    expect(planAdditions(matches, new Set(['watchmen']), 'digital', () => 'physical')[0].own).toBe('both');
    expect(planAdditions(matches, new Set(['watchmen']), 'physical', () => 'wishlist')[0].own).toBe('physical');
    expect(planAdditions(matches, new Set(['watchmen']), 'digital', () => 'digital')[0].own).toBe('digital');
  });
  it('never adds the same book twice', () => {
    const dupes = [matches[0], matches[0]];
    expect(planAdditions(dupes, new Set(['watchmen']), 'physical', () => 'none')).toHaveLength(1);
  });
});
