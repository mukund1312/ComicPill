import { describe, expect, it, vi } from 'vitest';
import { chooseMatch, confirmAllMatched, duplicateWithinScan, excludeItem, flagRepeats, importItems, isReady, itemFromDetected, repeatNumber, replace, summarize, type ImportDeps, type ScanItem } from './session';
import { decide } from './candidates';
import { validateManual } from './manual';

const cand = (id: string, title: string, score: number) => ({ id, title, score, reasons: [], editionWords: [] });
const det = (scanId: string, candidates: ReturnType<typeof cand>[], text = scanId) => ({
  scanId, box: { x: 0, y: 0, w: 0.05, h: 0.8 }, cropUri: `file:///${scanId}.jpg`, extractedText: [text], read: { title: text, volume: null, creators: [] }, candidates, decision: decide(candidates),
});
const defaults = { ownership: 'physical' as const, reading: 'unread' as const };
const make = (): ScanItem[] => [
  itemFromDetected(det('a', [cand('hush', 'Batman: Hush', 1)]), defaults),
  itemFromDetected(det('b', [cand('wm', 'Watchmen', 1)]), defaults),
  itemFromDetected(det('c', [cand('sand-1', 'The Sandman Vol. 1', 0.66), cand('sand-2', 'The Sandman Vol. 2', 0.66)]), defaults),
  itemFromDetected(det('d', []), defaults),
];
const deps = (over: Partial<ImportDeps> = {}): ImportDeps => ({ alreadyOwned: () => false, createCustom: () => 'custom-1', save: vi.fn(), setCover: vi.fn(async () => undefined), ...over });

describe('a fresh scan', () => {
  it('readies the confident matches and leaves the uncertain ones for the reader', () => {
    const items = make();
    expect(items.map((i) => i.status)).toEqual(['matched', 'matched', 'needs_review', 'unmatched']);
    expect(summarize(items)).toMatchObject({ total: 4, ready: 2, needsAttention: 2 });
  });
  it('never carries a cover: the spine picture is only for checking', () => {
    for (const i of make()) expect(i.customCoverUri).toBeNull();
  });
});

describe('correcting', () => {
  it('replaces a wrong match, marks it verified, and keeps the spine picture and the other results', () => {
    const before = make();
    const after = chooseMatch(before, 'c', { kind: 'catalog', workId: 'sand-2', title: 'The Sandman Vol. 2' });
    const c = after.find((i) => i.scanId === 'c')!;
    expect(c.selected).toMatchObject({ workId: 'sand-2' });
    expect(c.status).toBe('manually_verified');
    expect(c.cropUri).toBe('file:///c.jpg');
    expect(after.filter((i) => i.scanId !== 'c')).toEqual(before.filter((i) => i.scanId !== 'c'));
  });
  it('lets a comic that is not in the catalog be described by hand', () => {
    const r = validateManual({ title: 'Local Indie Book', publisher: 'Small Press' });
    if (!r.ok) throw new Error('valid');
    const after = chooseMatch(make(), 'd', { kind: 'custom', comic: r.value });
    expect(isReady(after.find((i) => i.scanId === 'd')!)).toBe(true);
  });
  it('keeps a cover that came with the choice (an online result and its picture are saved together)', () => {
    const r = validateManual({ title: 'Wonder Woman', publisher: 'DC Comics', isbn: '9781563891489' });
    if (!r.ok) throw new Error('valid');
    const withCover = replace(make(), 'd', { customCoverUri: 'file:///online-cover.jpg' });
    const after = chooseMatch(withCover, 'd', { kind: 'custom', comic: r.value });
    const d = after.find((i) => i.scanId === 'd')!;
    expect(d.customCoverUri).toBe('file:///online-cover.jpg');
    expect(d.status).toBe('manually_verified');
  });
  it('excludes and restores a result', () => {
    const excluded = excludeItem(make(), 'a', true);
    expect(excluded[0].status).toBe('excluded');
    expect(summarize(excluded).ready).toBe(1);
    expect(excludeItem(excluded, 'a', false)[0].status).toBe('matched');
  });
  it('confirms every confident match in one go without touching the uncertain ones', () => {
    const items = confirmAllMatched(make());
    expect(items.map((i) => i.status)).toEqual(['manually_verified', 'manually_verified', 'needs_review', 'unmatched']);
  });
});

describe('a later spine that matches the same book as an earlier one', () => {
  it('goes back to the reader as a question, naming the book it repeats, instead of being added silently', () => {
    const items = flagRepeats([
      itemFromDetected(det('k1', [cand('knightfall-1', 'Batman: Knightfall Vol. 1', 1)]), defaults),
      itemFromDetected(det('k2', [cand('knightfall-1', 'Batman: Knightfall Vol. 1', 1)]), defaults),
      itemFromDetected(det('k3', [cand('knightfall-1', 'Batman: Knightfall Vol. 1', 1)]), defaults),
      itemFromDetected(det('w', [cand('wm', 'Watchmen', 1)]), defaults),
    ]);
    expect(items.map((i) => i.status)).toEqual(['matched', 'needs_review', 'needs_review', 'matched']);
    expect(items[1].selected).toBeNull();
    expect(items[1].candidates[0].id).toBe('knightfall-1'); // still offered as a candidate
    expect(repeatNumber(items, items[1])).toBe(1);
    expect(repeatNumber(items, items[0])).toBeNull();
    expect(summarize(items).ready).toBe(2);
  });
  it('leaves a match the reader confirmed or chose themselves alone', () => {
    const confirmed = chooseMatch([itemFromDetected(det('a', [cand('hush', 'Batman: Hush', 1)]), defaults), itemFromDetected(det('b', [cand('hush', 'Batman: Hush', 1)]), defaults)], 'b', { kind: 'catalog', workId: 'hush', title: 'Batman: Hush' });
    expect(flagRepeats(confirmed)[1].status).toBe('manually_verified');
  });
});

describe('importing', () => {
  it('imports the ready results with their ownership and reading status', async () => {
    const d = deps();
    const items = make().map((i) => (i.scanId === 'b' ? { ...i, ownership: 'digital' as const, reading: 'completed' as const } : i));
    const out = await importItems(items, d);
    expect(out.map((i) => i.importState)).toEqual(['imported', 'imported', 'pending', 'pending']);
    expect(d.save).toHaveBeenCalledWith('hush', { ownership: 'physical', reading: 'unread', update: false });
    expect(d.save).toHaveBeenCalledWith('wm', { ownership: 'digital', reading: 'completed', update: false });
  });
  it('skips a comic already in the library unless the reader chose to update it', async () => {
    const d = deps({ alreadyOwned: (id) => id === 'hush' });
    expect((await importItems(make(), d))[0].importState).toBe('skipped');
    const d2 = deps({ alreadyOwned: (id) => id === 'hush' });
    const updated = await importItems(make().map((i) => (i.scanId === 'a' ? { ...i, onDuplicate: 'update' as const } : i)), d2);
    expect(updated[0].importState).toBe('updated');
    expect(d2.save).toHaveBeenCalledWith('hush', expect.objectContaining({ update: true }));
  });
  it('does not add the same catalog comic twice from one scan', async () => {
    const items = [...make(), itemFromDetected(det('e', [cand('hush', 'Batman: Hush', 1)]), defaults)];
    expect(duplicateWithinScan(items)).toEqual(new Set(['e']));
    const out = await importItems(items, deps());
    expect(out.find((i) => i.scanId === 'e')!.importState).toBe('skipped');
  });
  it('one failure does not stop the others, and a retry redoes only the failed one', async () => {
    let calls = 0;
    const flaky = deps({ save: vi.fn((id: string) => { calls++; if (id === 'hush' && calls === 1) throw new Error('disk full'); }) });
    const first = await importItems(make(), flaky);
    expect(first.map((i) => i.importState)).toEqual(['failed', 'imported', 'pending', 'pending']);
    expect(first[0].error).toBe('disk full');
    const again = await importItems(first, flaky);
    expect(again.map((i) => i.importState)).toEqual(['imported', 'imported', 'pending', 'pending']);
    expect((flaky.save as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'wm')).toHaveLength(1); // the one that worked was not done twice
  });
  it('creates a hand-described comic once, and keeps its custom cover separate from the catalog', async () => {
    const r = validateManual({ title: 'Local Indie Book' });
    if (!r.ok) throw new Error('valid');
    const createCustom = vi.fn(() => 'custom-9'); const setCover = vi.fn(async () => undefined);
    const items = chooseMatch(make(), 'd', { kind: 'custom', comic: r.value }).map((i) => (i.scanId === 'd' ? { ...i, customCoverUri: 'file:///mine.jpg' } : i));
    const once = await importItems(items, deps({ createCustom, setCover }));
    const d = once.find((i) => i.scanId === 'd')!;
    expect(d.importState).toBe('imported');
    expect(createCustom).toHaveBeenCalledTimes(1);
    expect(setCover).toHaveBeenCalledWith('custom-9', 'file:///mine.jpg');
    await importItems(once, deps({ createCustom, setCover }));
    expect(createCustom).toHaveBeenCalledTimes(1); // a second run does not make it again
  });
});
