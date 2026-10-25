// Sends one structured request to the reader's chosen provider with THEIR key,
// straight from the phone. No ComicPill server is involved. Failures come back
// as typed results (never thrown), each with a message fit to show.
import { buildCall, buildModelsCall, errorFromStatus, modelIdsFrom, parseReply } from './requests';
import type { AiConfig, AiResult, StructuredRequest } from './types';

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean; status: number; json: () => Promise<unknown>;
}>;

export interface RunOptions { fetchImpl?: FetchLike; timeoutMs?: number }

const DEFAULT_TIMEOUT_MS = 60_000; // a photo through a big model can take a while

async function call(url: string, init: Parameters<FetchLike>[1], opts: RunOptions): Promise<AiResult<{ status: number; json: unknown }>> {
  const doFetch = opts.fetchImpl ?? (fetch as unknown as FetchLike);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await doFetch(url, { ...init, signal: controller.signal });
    let json: unknown = null;
    try { json = await res.json(); } catch { /* error bodies aren't always JSON */ }
    const failure = errorFromStatus(res.status);
    if (failure) return { ok: false, ...failure };
    return { ok: true, data: { status: res.status, json } };
  } catch {
    return { ok: false, kind: 'network', message: 'Couldn’t reach the provider. Check your connection and try again.' };
  } finally {
    clearTimeout(timer);
  }
}

/** Send `req`; parse the JSON the model produced with `validate` (which must
 *  return null for anything that doesn't fit — model output is untrusted). */
export async function runStructured<T>(
  cfg: AiConfig | null,
  req: StructuredRequest,
  validate: (raw: unknown) => T | null,
  opts: RunOptions = {},
): Promise<AiResult<T>> {
  if (!cfg || !cfg.apiKey) return { ok: false, kind: 'no_key', message: 'Add an API key in Settings first.' };
  const { url, init } = buildCall(cfg, req);
  const res = await call(url, init, opts);
  if (!res.ok) return res;

  const text = parseReply(cfg.provider, res.data.json);
  if (!text.ok) return text;

  let raw: unknown;
  try { raw = JSON.parse(text.text); } catch { return { ok: false, kind: 'invalid_output', message: 'The reply wasn’t in the expected format.' }; }
  const data = validate(raw);
  return data === null ? { ok: false, kind: 'invalid_output', message: 'The reply wasn’t in the expected format.' } : { ok: true, data };
}

export interface KeyCheck { modelAvailable: boolean | null }

/** Ask the provider to list models: free, instant, and proves the key works.
 *  `modelAvailable` says whether the chosen model is one this key can use. */
export async function checkKey(cfg: AiConfig, opts: RunOptions = {}): Promise<AiResult<KeyCheck>> {
  if (!cfg.apiKey) return { ok: false, kind: 'no_key', message: 'Paste your API key first.' };
  const { url, init } = buildModelsCall(cfg);
  const res = await call(url, init, { ...opts, timeoutMs: opts.timeoutMs ?? 15_000 });
  if (!res.ok) return res;
  const ids = modelIdsFrom(res.data.json);
  return { ok: true, data: { modelAvailable: ids.length ? ids.includes(cfg.model) : null } };
}
