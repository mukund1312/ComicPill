import type { FetchLike } from '../mind/remote/types';
import { basicAuth, fillSearch, parseFeed, parseOpenSearch, resolveUrl, type OpdsFeed } from './parse';
import { passwordOf, type OpdsServer } from './servers';

export class OpdsError extends Error {
  constructor(message: string, readonly kind: 'network' | 'unauthorized' | 'not_opds' | 'server') { super(message); }
}

export async function authHeaders(server: OpdsServer): Promise<Record<string, string>> {
  const pass = await passwordOf(server.id);
  return server.user || pass ? { authorization: basicAuth(server.user, pass) } : {};
}

async function getText(url: string, headers: Record<string, string>, fetchImpl: FetchLike): Promise<string> {
  let res;
  try { res = await fetchImpl(url, { headers: { accept: 'application/atom+xml, application/xml, text/xml, */*', ...headers } }); }
  catch { throw new OpdsError('Couldn’t reach the server. Check the address and your connection.', 'network'); }
  if (res.status === 401 || res.status === 403) throw new OpdsError('The server asked for a login. Check the user name and password.', 'unauthorized');
  if (!res.ok) throw new OpdsError(`The server answered with an error (${res.status}).`, 'server');
  const body = res as unknown as { text?: () => Promise<string> };
  if (!body.text) throw new OpdsError('Unreadable reply.', 'server');
  return body.text();
}

export async function loadFeed(url: string, server: OpdsServer, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<OpdsFeed> {
  const xml = await getText(url, await authHeaders(server), fetchImpl);
  try { return parseFeed(xml, url); } catch { throw new OpdsError('That address answered, but not with an OPDS catalog.', 'not_opds'); }
}

/** The URL to open for a search, whether the feed gave a template or a separate OpenSearch description. */
export async function searchUrl(feed: OpdsFeed, feedUrl: string, server: OpdsServer, terms: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<string | null> {
  let template = feed.search;
  if (!template && feed.searchDescription) {
    const t = parseOpenSearch(await getText(feed.searchDescription, await authHeaders(server), fetchImpl));
    template = t ? resolveUrl(feedUrl, t) : null;
  }
  return template ? fillSearch(template, terms) : null;
}
