// Local-only sharing: no backend exists yet (no Supabase project, no
// accounts), so "share a playlist with someone else" has to work as a
// self-contained code today — paste it, or open a deep link carrying it,
// and the receiving install decodes + resolves it against its own local
// catalog. Deliberately dependency-free (no btoa/atob — not guaranteed to
// exist under Hermes) so this has no runtime surprises across devices.
export interface SharedPlaylistItem { workId: string; title: string; }
export interface SharedPlaylistPayload { v: 1; name: string; items: SharedPlaylistItem[]; }

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function utf8Bytes(str: string): number[] {
  const bytes: number[] = [];
  for (const ch of encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))) {
    bytes.push(ch.charCodeAt(0));
  }
  return bytes;
}

function bytesToUtf8(bytes: number[]): string {
  const escaped = bytes.map((b) => '%' + b.toString(16).padStart(2, '0')).join('');
  return decodeURIComponent(escaped);
}

function b64Encode(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    const chunk = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);
    out += B64_ALPHABET[(chunk >> 18) & 63];
    out += B64_ALPHABET[(chunk >> 12) & 63];
    out += b1 === undefined ? '=' : B64_ALPHABET[(chunk >> 6) & 63];
    out += b2 === undefined ? '=' : B64_ALPHABET[chunk & 63];
  }
  return out;
}

function b64Decode(code: string): number[] {
  const clean = code.replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    const val = B64_ALPHABET.indexOf(ch);
    if (val === -1) continue; // skip whitespace/unknown chars from a pasted/wrapped code
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}

/** "PILL1:" prefix makes a pasted code recognizable and lets the format
 *  version change later without guessing from raw base64. */
const PREFIX = 'PILL1:';

export function encodePlaylistShare(name: string, items: SharedPlaylistItem[]): string {
  const payload: SharedPlaylistPayload = { v: 1, name, items };
  return PREFIX + b64Encode(utf8Bytes(JSON.stringify(payload)));
}

export function decodePlaylistShare(code: string): SharedPlaylistPayload | null {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX)) return null;
  try {
    const json = bytesToUtf8(b64Decode(trimmed.slice(PREFIX.length)));
    const parsed = JSON.parse(json);
    if (parsed?.v !== 1 || typeof parsed.name !== 'string' || !Array.isArray(parsed.items)) return null;
    return parsed as SharedPlaylistPayload;
  } catch {
    return null;
  }
}

export interface ResolvedSharedItem { workId: string; title: string; matchedBy: 'id' | 'title'; }

/** Resolve a decoded payload against the local catalog: an id match is
 *  authoritative (the seed catalog ships identical ids to every install);
 *  a title match is the fallback for once the catalog scales and installs
 *  can be on different versions. Titles are matched case/whitespace-loosely. */
export function resolveSharedItems(
  items: SharedPlaylistItem[],
  catalogTitleById: Map<string, string>,
): { resolved: ResolvedSharedItem[]; unresolved: SharedPlaylistItem[] } {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const idByTitle = new Map<string, string>();
  for (const [id, title] of catalogTitleById) idByTitle.set(normalize(title), id);

  const resolved: ResolvedSharedItem[] = [];
  const unresolved: SharedPlaylistItem[] = [];
  for (const item of items) {
    if (catalogTitleById.has(item.workId)) {
      resolved.push({ workId: item.workId, title: catalogTitleById.get(item.workId)!, matchedBy: 'id' });
      continue;
    }
    const byTitle = idByTitle.get(normalize(item.title));
    if (byTitle) {
      resolved.push({ workId: byTitle, title: item.title, matchedBy: 'title' });
      continue;
    }
    unresolved.push(item);
  }
  return { resolved, unresolved };
}
