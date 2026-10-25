// Saved OPDS servers. The address and user name are ordinary settings; the password lives in secure storage.
import * as SecureStore from 'expo-secure-store';
import { getMeta, setMeta } from '../db/queries/meta';

export type OpdsServer = { id: string; name: string; url: string; user: string };

const KEY = 'opds_servers';
const slot = (id: string) => `comicpill.opds.${id}`;

export function listServers(): OpdsServer[] {
  try { const v = JSON.parse(getMeta(KEY) ?? '[]'); return Array.isArray(v) ? (v as OpdsServer[]) : []; } catch { return []; }
}

/** Accept what people actually type: a bare host, a missing scheme, trailing spaces. */
export function normalizeServerUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `http://${t}`;
}

export async function saveServer(s: Omit<OpdsServer, 'id'> & { id?: string }, password: string): Promise<OpdsServer> {
  const server: OpdsServer = { id: s.id ?? `s${Date.now().toString(36)}`, name: s.name.trim() || 'My comics', url: normalizeServerUrl(s.url), user: s.user.trim() };
  setMeta(KEY, JSON.stringify([...listServers().filter((x) => x.id !== server.id), server]));
  if (password) await SecureStore.setItemAsync(slot(server.id), password); else await SecureStore.deleteItemAsync(slot(server.id)).catch(() => undefined);
  return server;
}

export async function removeServer(id: string): Promise<void> {
  setMeta(KEY, JSON.stringify(listServers().filter((x) => x.id !== id)));
  await SecureStore.deleteItemAsync(slot(id)).catch(() => undefined);
}

export async function passwordOf(id: string): Promise<string> {
  try { return (await SecureStore.getItemAsync(slot(id))) ?? ''; } catch { return ''; }
}
