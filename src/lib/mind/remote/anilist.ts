// AniList (manga). Public GraphQL API, no key needed. Check AniList's current terms and rate limits
// (it has been ~90 requests a minute) before building on it — every response is cached by the caller.
import { LookupError, type ExternalRelation, type ExternalSeries, type FetchLike } from './types';

export const ANILIST_URL = 'https://graphql.anilist.co';

const QUERY = `query ($search: String) { Page(perPage: 6) { media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
  id title { romaji english native } format status volumes chapters genres tags { name rank } description(asHtml: false)
  coverImage { large } startDate { year }
  staff(perPage: 4) { edges { role node { name { full } } } }
  relations { edges { relationType node { id type title { romaji english } format status volumes startDate { year } } } }
} } }`;

type Media = {
  id: number; title: { romaji?: string | null; english?: string | null; native?: string | null }; format?: string | null; status?: string | null;
  volumes?: number | null; chapters?: number | null; genres?: string[]; tags?: Array<{ name: string; rank?: number }>; description?: string | null;
  coverImage?: { large?: string | null } | null; startDate?: { year?: number | null } | null;
  staff?: { edges?: Array<{ role?: string; node?: { name?: { full?: string | null } } }> } | null;
  relations?: { edges?: Array<{ relationType?: string; node?: { id: number; type?: string; title?: { romaji?: string | null; english?: string | null }; format?: string | null; status?: string | null; volumes?: number | null; startDate?: { year?: number | null } | null } }> } | null;
};

const KIND: Record<string, ExternalRelation['kind']> = { PREQUEL: 'prequel', SEQUEL: 'sequel', PARENT: 'parent', SIDE_STORY: 'side_story', SPIN_OFF: 'spin_off' };
const statusOf = (s?: string | null): ExternalSeries['status'] => (s === 'FINISHED' ? 'finished' : s === 'RELEASING' || s === 'HIATUS' ? 'ongoing' : 'unknown');
const nameOf = (t?: { romaji?: string | null; english?: string | null }) => t?.english || t?.romaji || '';
const stripHtml = (s: string) => s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\s+\n/g, '\n').trim();

export function normalizeMedia(m: Media): ExternalSeries {
  const relations: ExternalRelation[] = [];
  for (const e of m.relations?.edges ?? []) {
    const n = e.node;
    if (!n || n.type !== 'MANGA') continue; // anime adaptations aren't reading order
    relations.push({ kind: KIND[e.relationType ?? ''] ?? 'other', externalId: String(n.id), title: nameOf(n.title), year: n.startDate?.year ?? undefined, units: n.volumes ?? 0, status: statusOf(n.status) });
  }
  const creators = (m.staff?.edges ?? []).filter((e) => /story|art/i.test(e.role ?? '')).map((e) => e.node?.name?.full ?? '').filter(Boolean);
  return {
    source: 'anilist', externalId: String(m.id), title: nameOf(m.title),
    altTitles: [m.title.romaji, m.title.english, m.title.native].filter((t): t is string => !!t),
    medium: 'manga', year: m.startDate?.year ?? undefined, status: statusOf(m.status),
    units: m.volumes ?? 0, unitName: 'volumes', genres: m.genres ?? [],
    tags: (m.tags ?? []).filter((t) => (t.rank ?? 0) >= 60).slice(0, 12).map((t) => t.name),
    creators: [...new Set(creators)], description: stripHtml(m.description ?? ''), coverUrl: m.coverImage?.large ?? undefined, relations,
  };
}

export function parseSearch(json: unknown): ExternalSeries[] {
  const media = (json as { data?: { Page?: { media?: Media[] } } })?.data?.Page?.media;
  return Array.isArray(media) ? media.map(normalizeMedia).filter((s) => s.title) : [];
}

export async function searchAniList(query: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<ExternalSeries[]> {
  let res;
  try {
    res = await fetchImpl(ANILIST_URL, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ query: QUERY, variables: { search: query } }) });
  } catch { throw new LookupError('Couldn’t reach AniList.', 'network'); }
  if (res.status === 429) throw new LookupError('AniList is rate-limiting requests. Try again in a minute.', 'rate_limited');
  if (!res.ok) throw new LookupError('AniList had a problem.', 'server');
  return parseSearch(await res.json());
}
