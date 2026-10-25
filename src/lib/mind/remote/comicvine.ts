// Comic Vine (Western comics). Needs the reader's own free API key — add it in Mind Space settings.
// Comic Vine has no prequel/sequel fields, so relations for these series come from the AI and are
// always marked AI-suggested. It also rejects requests without a User-Agent.
import { LookupError, type ExternalSeries, type FetchLike } from './types';

const BASE = 'https://comicvine.gamespot.com/api';
const UA = 'ComicPill/1.0 (personal reading planner)';

type CvVolume = {
  id: number; name?: string; start_year?: string | number | null; count_of_issues?: number | null; deck?: string | null; description?: string | null;
  publisher?: { name?: string } | null; image?: { medium_url?: string; small_url?: string } | null; people?: Array<{ name?: string }> | null;
};

const stripHtml = (s: string) => s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();

export function normalizeVolume(v: CvVolume): ExternalSeries {
  const year = Number.parseInt(String(v.start_year ?? ''), 10);
  return {
    source: 'comicvine', externalId: String(v.id), title: v.name ?? '', altTitles: [], medium: 'comic',
    year: Number.isFinite(year) ? year : undefined, status: 'unknown', units: v.count_of_issues ?? 0, unitName: 'issues',
    genres: [], tags: [], creators: (v.people ?? []).map((p) => p.name ?? '').filter(Boolean).slice(0, 6),
    description: stripHtml(v.description ?? v.deck ?? ''), coverUrl: v.image?.medium_url ?? v.image?.small_url, publisher: v.publisher?.name, relations: [],
  };
}

export function parseVolumes(json: unknown): ExternalSeries[] {
  const j = json as { status_code?: number; results?: unknown };
  if (!j || (j.status_code !== undefined && j.status_code !== 1) || !Array.isArray(j.results)) return [];
  return (j.results as CvVolume[]).map(normalizeVolume).filter((s) => s.title);
}

export async function searchComicVine(query: string, apiKey: string | null, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<ExternalSeries[]> {
  if (!apiKey) throw new LookupError('Add a Comic Vine key in Mind Space settings to look up Western comics.', 'no_key');
  const url = `${BASE}/search/?api_key=${encodeURIComponent(apiKey)}&format=json&resources=volume&limit=6&query=${encodeURIComponent(query)}&field_list=id,name,start_year,count_of_issues,deck,description,publisher,image`;
  let res;
  try { res = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'application/json' } }); } catch { throw new LookupError('Couldn’t reach Comic Vine.', 'network'); }
  if (res.status === 401 || res.status === 403) throw new LookupError('Comic Vine rejected the key.', 'unauthorized');
  if (res.status === 420 || res.status === 429) throw new LookupError('Comic Vine is rate-limiting requests. Try again later.', 'rate_limited');
  if (!res.ok) throw new LookupError('Comic Vine had a problem.', 'server');
  return parseVolumes(await res.json());
}
