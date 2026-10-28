// A comic that stays on a comic server (Komga, Kavita…) is remembered as `opds:<server id>|<its address on that server>`. The address is kept
// without the server's host, so if the server's address changes (a new IP on the home network) it is fixed once in the server's settings.
import { File } from 'expo-file-system';
import { authHeaders } from './client';
import { listServers } from './servers';

export const OPDS_PREFIX = 'opds:';
export const isOpdsSource = (sourceUri: string | null | undefined): boolean => !!sourceUri && sourceUri.startsWith(OPDS_PREFIX);

const originOf = (url: string): string => /^([a-z][a-z0-9+.-]*:\/\/[^/?#]+)/i.exec(url)?.[1] ?? '';

export const opdsSourceFor = (serverId: string, serverUrl: string, href: string): string => {
  const origin = originOf(serverUrl);
  return `${OPDS_PREFIX}${serverId}|${origin && href.startsWith(origin) ? href.slice(origin.length) : href}`;
};

export function parseOpdsSource(sourceUri: string): { serverId: string; path: string } {
  const rest = sourceUri.slice(OPDS_PREFIX.length); const bar = rest.indexOf('|');
  return { serverId: bar < 0 ? rest : rest.slice(0, bar), path: bar < 0 ? '' : rest.slice(bar + 1) };
}

/** Download a comic from its server straight to `destUri`. */
export async function downloadFromOpds(sourceUri: string, destUri: string): Promise<void> {
  const { serverId, path } = parseOpdsSource(sourceUri);
  const server = listServers().find((s) => s.id === serverId);
  if (!server) throw new Error('The server this comic came from has been removed.');
  const url = /^https?:\/\//i.test(path) ? path : originOf(server.url) + path;
  const dest = new File(destUri);
  try { if (dest.exists) dest.delete(); } catch { /* it is replaced below */ }
  await File.downloadFileAsync(url, dest, { headers: await authHeaders(server), idempotent: true });
}
