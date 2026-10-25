// OPDS 1.x (Atom) catalog feeds — what Komga, Calibre-Web, Kavita and most comic servers speak.
// Pure: parse text in, plain objects out. Network and storage live elsewhere.
import { XMLParser } from 'fast-xml-parser';

export type ComicExt = 'cbz' | 'cbr' | 'cb7' | 'pdf' | 'epub' | 'zip';
export type OpdsAcquisition = { href: string; type: string; ext: ComicExt | null };
export type OpdsEntry = {
  id: string; title: string; authors: string[]; summary: string; thumb: string | null;
  /** A sub-catalog to open (a series, a library, a letter…). */
  nav: string | null;
  /** Files you can download, best first. */
  acquisitions: OpdsAcquisition[];
};
export type OpdsFeed = { title: string; entries: OpdsEntry[]; next: string | null; /** URL template containing {searchTerms}, if the feed can search. */ search: string | null; /** An OpenSearch description to fetch for the template, when that is how the server does it. */ searchDescription: string | null };

const parser = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', removeNSPrefix: true, trimValues: true,
  isArray: (name) => ['entry', 'link', 'author', 'Url'].includes(name),
});

const REL = {
  acquisition: 'http://opds-spec.org/acquisition',
  image: 'http://opds-spec.org/image', thumb: 'http://opds-spec.org/image/thumbnail',
};

/** Resolve `href` against the feed's own URL (React Native's URL class can't be trusted with relative paths). */
export function resolveUrl(base: string, href: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
  const origin = /^([a-z][a-z0-9+.-]*:\/\/[^/?#]+)/i.exec(base)?.[1] ?? '';
  if (href.startsWith('//')) return `${origin.split(':')[0]}:${href}`;
  if (href.startsWith('/')) return origin + href;
  const path = base.slice(origin.length).split(/[?#]/)[0];
  const dir = path.slice(0, path.lastIndexOf('/') + 1) || '/';
  const parts = (dir + href).split('/'); const out: string[] = [];
  for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.') out.push(p); }
  return origin + out.join('/').replace(/\/{2,}/g, '/');
}

const MIME_EXT: Array<[RegExp, ComicExt]> = [
  [/comicbook\+zip|x-cbz|cbz/i, 'cbz'], [/comicbook-rar|x-cbr|cbr/i, 'cbr'], [/x-cb7|cb7|7z/i, 'cb7'],
  [/pdf/i, 'pdf'], [/epub/i, 'epub'], [/application\/zip/i, 'zip'],
];
export const extOfType = (type: string, href = ''): ComicExt | null => {
  for (const [re, ext] of MIME_EXT) if (re.test(type)) return ext;
  const m = /\.(cbz|cbr|cb7|pdf|epub|zip)(?:$|[?#])/i.exec(href);
  return m ? (m[1].toLowerCase() as ComicExt) : null;
};

const PREFERENCE: ComicExt[] = ['cbz', 'cbr', 'cb7', 'pdf', 'epub', 'zip'];
const rank = (a: OpdsAcquisition) => { const i = a.ext ? PREFERENCE.indexOf(a.ext) : 99; return i < 0 ? 99 : i; };

type Link = { '@_href'?: string; '@_rel'?: string; '@_type'?: string };
const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : v && typeof v === 'object' && '#text' in v ? String((v as { '#text': unknown })['#text']) : '').trim();

export function parseFeed(xml: string, baseUrl: string): OpdsFeed {
  const doc = parser.parse(xml) as { feed?: Record<string, unknown> };
  const feed = doc.feed;
  if (!feed) throw new Error('This is not an OPDS catalog.');
  const links = (feed.link as Link[] | undefined) ?? [];
  const hrefOf = (l: Link) => resolveUrl(baseUrl, l['@_href'] ?? '');

  const searchLink = links.find((l) => l['@_rel'] === 'search');
  const search = searchLink && (l => l['@_href']?.includes('{searchTerms}') ? decodeURI(hrefOf(l)).replace('%7BsearchTerms%7D', '{searchTerms}') : null)(searchLink);
  const entries: OpdsEntry[] = [];
  for (const e of (feed.entry as Array<Record<string, unknown>> | undefined) ?? []) {
    const eLinks = (e.link as Link[] | undefined) ?? [];
    const acquisitions = eLinks
      .filter((l) => (l['@_rel'] ?? '').startsWith(REL.acquisition) && !/buy|borrow|subscribe|sample/i.test(l['@_rel'] ?? ''))
      .map((l): OpdsAcquisition => ({ href: hrefOf(l), type: l['@_type'] ?? '', ext: extOfType(l['@_type'] ?? '', l['@_href'] ?? '') }))
      .filter((a) => a.href)
      .sort((a, b) => rank(a) - rank(b));
    const navLink = acquisitions.length ? undefined : eLinks.find((l) => (l['@_rel'] === 'subsection' || l['@_rel'] === 'http://opds-spec.org/sort/new' || l['@_rel'] === 'http://opds-spec.org/sort/popular' || /atom\+xml/i.test(l['@_type'] ?? '')) && l['@_href']);
    const thumb = eLinks.find((l) => l['@_rel'] === REL.thumb) ?? eLinks.find((l) => l['@_rel'] === REL.image);
    const authors = ((e.author as Array<Record<string, unknown>> | undefined) ?? []).map((a) => text(a.name)).filter(Boolean);
    entries.push({
      id: text(e.id) || text(e.title), title: text(e.title) || 'Untitled', authors,
      summary: text(e.summary) || text(e.content), thumb: thumb?.['@_href'] ? hrefOf(thumb) : null,
      nav: navLink ? hrefOf(navLink) : null, acquisitions,
    });
  }
  const next = links.find((l) => l['@_rel'] === 'next');
  const desc = searchLink && /opensearchdescription/i.test(searchLink['@_type'] ?? '') ? hrefOf(searchLink) : null;
  return { title: text(feed.title) || 'Catalog', entries, next: next ? hrefOf(next) : null, search: search ?? null, searchDescription: desc };
}

/** Pull the Atom search template out of an OpenSearch description document. */
export function parseOpenSearch(xml: string): string | null {
  const doc = parser.parse(xml) as { OpenSearchDescription?: { Url?: Array<Record<string, string>> } };
  const urls = doc.OpenSearchDescription?.Url ?? [];
  const best = urls.find((u) => /atom\+xml/i.test(u['@_type'] ?? '') && u['@_template']) ?? urls.find((u) => u['@_template']);
  return best?.['@_template'] ?? null;
}

export const fillSearch = (template: string, terms: string) => template.replace('{searchTerms}', encodeURIComponent(terms)).replace(/\{[^}]*\}/g, '');

/** "Authorization" header for HTTP Basic, which is what self-hosted comic servers use. */
export function basicAuth(user: string, pass: string): string {
  const bytes = new TextEncoder().encode(`${user}:${pass}`);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    out += chars[a >> 2] + chars[((a & 3) << 4) | ((b ?? 0) >> 4)] + (b === undefined ? '=' : chars[((b & 15) << 2) | ((c ?? 0) >> 6)]) + (c === undefined ? '=' : chars[c & 63]);
  }
  return `Basic ${out}`;
}

export const safeFileName = (title: string, ext: string) => `${title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'comic'}.${ext}`;
