import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpdsEntry, OpdsFeed } from './parse';

const feeds = new Map<string, OpdsFeed>();
vi.mock('./client', () => ({ loadFeed: async (url: string) => { const f = feeds.get(url); if (!f) throw new Error(`no feed ${url}`); return f; } }));

import { crawlCatalog } from './crawl';

const server = { id: 's', name: 'Home', url: 'http://x', user: '' };
const book = (id: string, title = id): OpdsEntry => ({ id, title, authors: [], summary: '', thumb: null, nav: null, acquisitions: [{ href: `http://x/${id}.cbz`, type: 'application/zip', ext: 'cbz' }] });
const dir = (title: string, nav: string): OpdsEntry => ({ id: nav, title, authors: [], summary: '', thumb: null, nav, acquisitions: [] });
const feed = (entries: OpdsEntry[], next: string | null = null): OpdsFeed => ({ title: 't', entries, next, search: null, searchDescription: null });

describe('crawlCatalog', () => {
  beforeEach(() => feeds.clear());

  it('finds comics through sub-catalogs and pages, filing each under its series', async () => {
    feeds.set('root', feed([dir('Libraries', 'libs'), dir('Latest', 'latest')]));
    feeds.set('libs', feed([dir('Comics', 'lib1')]));
    feeds.set('lib1', feed([dir('Batman', 'batman')]));
    feeds.set('batman', feed([book('b1')], 'batman2'));
    feeds.set('batman2', feed([book('b2')]));
    feeds.set('latest', feed([book('b1')])); // repeats a book; skipped section
    const found = await crawlCatalog(server, 'root');
    expect(found.map((f) => f.entry.id)).toEqual(['b1', 'b2']);
    expect(found[0].path).toEqual(['Comics', 'Batman']);
  });

  it('counts a comic once even when two series list it', async () => {
    feeds.set('root', feed([dir('A', 'a'), dir('B', 'b')]));
    feeds.set('a', feed([book('x')]));
    feeds.set('b', feed([book('x'), book('y')]));
    expect((await crawlCatalog(server, 'root')).map((f) => f.entry.id)).toEqual(['x', 'y']);
  });

  it('does not loop on a catalog that links back to itself', async () => {
    feeds.set('root', feed([dir('Again', 'root'), book('z')], 'root'));
    expect((await crawlCatalog(server, 'root')).map((f) => f.entry.id)).toEqual(['z']);
  });

  it('stops when asked to', async () => {
    feeds.set('root', feed([book('a'), book('b')]));
    const cancel = { cancelled: true };
    expect(await crawlCatalog(server, 'root', { cancel })).toEqual([]);
  });
});
