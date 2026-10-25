import { describe, expect, it } from 'vitest';
import { basicAuth, extOfType, fillSearch, parseFeed, parseOpenSearch, resolveUrl, safeFileName } from './parse';

const NAV = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>root</id><title>My Comics</title>
  <link rel="self" href="/opds/v1.2/catalog" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="search" href="/opds/v1.2/search?q={searchTerms}" type="application/atom+xml"/>
  <entry><id>series</id><title>All series</title><content type="text">Browse by series</content>
    <link rel="subsection" href="series" type="application/atom+xml;profile=opds-catalog;kind=navigation"/></entry>
  <entry><id>new</id><title>Recently added</title>
    <link rel="http://opds-spec.org/sort/new" href="/opds/v1.2/new" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/></entry>
</feed>`;

const ACQ = `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/terms/">
  <title>Saga</title>
  <link rel="next" href="/opds/series/1?page=2" type="application/atom+xml"/>
  <entry><id>urn:1</id><title>Saga #1</title><author><name>Brian K. Vaughan</name></author><author><name>Fiona Staples</name></author>
    <summary>A star-crossed romance.</summary>
    <link rel="http://opds-spec.org/image/thumbnail" href="/covers/1/thumb.jpg" type="image/jpeg"/>
    <link rel="http://opds-spec.org/acquisition" href="/dl/1.epub" type="application/epub+zip"/>
    <link rel="http://opds-spec.org/acquisition/open-access" href="/dl/1.cbz" type="application/vnd.comicbook+zip"/>
    <link rel="http://opds-spec.org/acquisition/buy" href="/buy/1" type="text/html"/>
  </entry>
  <entry><id>urn:2</id><title>Saga #2</title>
    <link rel="http://opds-spec.org/acquisition" href="../dl/2.cbr" type="application/octet-stream"/></entry>
</feed>`;

describe('resolveUrl', () => {
  const base = 'https://comics.example.com/opds/v1.2/catalog?x=1';
  it('handles every kind of href a server sends', () => {
    expect(resolveUrl(base, 'https://cdn.example.com/a')).toBe('https://cdn.example.com/a');
    expect(resolveUrl(base, '/dl/1.cbz')).toBe('https://comics.example.com/dl/1.cbz');
    expect(resolveUrl(base, 'series')).toBe('https://comics.example.com/opds/v1.2/series');
    expect(resolveUrl(base, '../dl/2.cbr')).toBe('https://comics.example.com/opds/dl/2.cbr');
    expect(resolveUrl(base, '//img.example.com/c.jpg')).toBe('https://img.example.com/c.jpg');
  });
});

describe('navigation feeds', () => {
  const feed = parseFeed(NAV, 'https://comics.example.com/opds/v1.2/catalog');
  it('lists sub-catalogs with absolute links', () => {
    expect(feed.title).toBe('My Comics');
    expect(feed.entries.map((e) => [e.title, e.nav])).toEqual([['All series', 'https://comics.example.com/opds/v1.2/series'], ['Recently added', 'https://comics.example.com/opds/v1.2/new']]);
    expect(feed.entries[0].summary).toBe('Browse by series');
    expect(feed.entries.every((e) => e.acquisitions.length === 0)).toBe(true);
  });
  it('finds the search template', () => expect(fillSearch(feed.search!, 'saga & co')).toBe('https://comics.example.com/opds/v1.2/search?q=saga%20%26%20co'));
});

describe('acquisition feeds', () => {
  const feed = parseFeed(ACQ, 'https://comics.example.com/opds/series/1');
  it('lists downloadable comics, best format first, ignoring purchase links', () => {
    const [one, two] = feed.entries;
    expect(one.title).toBe('Saga #1');
    expect(one.authors).toEqual(['Brian K. Vaughan', 'Fiona Staples']);
    expect(one.acquisitions.map((a) => a.ext)).toEqual(['cbz', 'epub']);
    expect(one.acquisitions[0].href).toBe('https://comics.example.com/dl/1.cbz');
    expect(one.thumb).toBe('https://comics.example.com/covers/1/thumb.jpg');
    expect(one.nav).toBeNull();
    expect(two.acquisitions[0]).toMatchObject({ ext: 'cbr', href: 'https://comics.example.com/opds/dl/2.cbr' }); // type is generic, the extension decides
  });
  it('knows where the next page is', () => expect(feed.next).toBe('https://comics.example.com/opds/series/1?page=2'));
});

describe('odds and ends', () => {
  it('rejects things that are not catalogs', () => {
    expect(() => parseFeed('<html><body>Login</body></html>', 'https://x.test/')).toThrow(/OPDS/);
  });
  it('maps types and extensions', () => {
    expect([extOfType('application/x-cbz'), extOfType('application/pdf'), extOfType('application/octet-stream', '/a/b.CB7?token=1'), extOfType('text/html')]).toEqual(['cbz', 'pdf', 'cb7', null]);
  });
  it('reads an OpenSearch description', () => {
    expect(parseOpenSearch('<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/"><Url type="text/html" template="/s?q={searchTerms}"/><Url type="application/atom+xml" template="/opds/search?q={searchTerms}"/></OpenSearchDescription>')).toBe('/opds/search?q={searchTerms}');
  });
  it('builds basic auth (including non-ASCII)', () => {
    expect(basicAuth('user', 'pass')).toBe('Basic dXNlcjpwYXNz');
    expect(basicAuth('a', 'é')).toBe('Basic YTrDqQ==');
  });
  it('makes safe file names', () => expect(safeFileName('Saga: #1 / “Vol”?', 'cbz')).toBe('Saga #1 / “Vol”.cbz'.replace('/', '').replace('  ', ' ')));
});
