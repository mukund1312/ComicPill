// Turn a provider-neutral request into that provider's HTTP call, and turn
// its reply back into plain text or a typed error. Pure: no network here, so
// every branch is testable. The Anthropic SDK does not support React Native,
// so the app talks to both providers over plain HTTPS.
import { anthropicCaps } from './models';
import type { AiConfig, AiErrorKind, StructuredRequest } from './types';

export interface HttpCall { url: string; init: { method: 'POST' | 'GET'; headers: Record<string, string>; body?: string } }

const ANTHROPIC_VERSION = '2023-06-01';

export function buildAnthropicCall(cfg: AiConfig, req: StructuredRequest): HttpCall {
  const caps = anthropicCaps(cfg.model);
  const content = [
    ...(req.imagesBase64 ?? []).map((data) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })),
    { type: 'text', text: req.text },
  ];
  const body: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: Math.min(req.maxTokens ?? caps.maxTokens, caps.maxTokens),
    system: req.system,
    messages: [{ role: 'user', content }],
    output_config: { format: { type: 'json_schema', schema: req.schema }, ...(caps.effort ? { effort: 'low' } : {}) },
    ...(caps.fallbacks ? { fallbacks: 'default' } : {}),
  };
  return {
    url: 'https://api.anthropic.com/v1/messages',
    init: {
      method: 'POST',
      headers: {
        'x-api-key': cfg.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
        ...(caps.fallbacks ? { 'anthropic-beta': 'server-side-fallback-2026-07-01' } : {}),
      },
      body: JSON.stringify(body),
    },
  };
}

export function buildOpenAiCall(cfg: AiConfig, req: StructuredRequest): HttpCall {
  const body = {
    model: cfg.model,
    instructions: req.system,
    input: [{
      role: 'user',
      content: [
        { type: 'input_text', text: req.text },
        ...(req.imagesBase64 ?? []).map((data) => ({ type: 'input_image', image_url: `data:image/jpeg;base64,${data}`, detail: 'auto' })),
      ],
    }],
    text: { format: { type: 'json_schema', name: req.schemaName, strict: true, schema: req.schema } },
    max_output_tokens: req.maxTokens ?? 3000,
    store: false, // don't let the provider keep the reader's photos or text
  };
  return {
    url: 'https://api.openai.com/v1/responses',
    init: { method: 'POST', headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(body) },
  };
}

export const buildCall = (cfg: AiConfig, req: StructuredRequest): HttpCall =>
  cfg.provider === 'anthropic' ? buildAnthropicCall(cfg, req) : buildOpenAiCall(cfg, req);

// ---- replies ------------------------------------------------------------------

export type TextOutcome = { ok: true; text: string } | { ok: false; kind: AiErrorKind; message: string };

const fail = (kind: AiErrorKind, message: string): TextOutcome => ({ ok: false, kind, message });

/** HTTP status -> what went wrong, in the reader's terms. */
export function errorFromStatus(status: number): { kind: AiErrorKind; message: string } | null {
  if (status >= 200 && status < 300) return null;
  if (status === 401 || status === 403) return { kind: 'unauthorized', message: 'The provider rejected your API key.' };
  if (status === 404) return { kind: 'model_not_found', message: 'That model isn’t available for your key. Pick another one.' };
  if (status === 429) return { kind: 'rate_limited', message: 'You’ve hit the provider’s rate limit or your credit is used up.' };
  if (status === 408 || status >= 500) return { kind: 'server', message: 'The provider had a problem. Try again in a moment.' };
  return { kind: 'server', message: 'The provider couldn’t handle that request.' };
}

const asRecord = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null);

export function parseAnthropicReply(json: unknown): TextOutcome {
  const r = asRecord(json);
  if (!r) return fail('invalid_output', 'The reply wasn’t readable.');
  // Branch on stop_reason before reading content (a refusal can leave it empty).
  if (r.stop_reason === 'refusal') return fail('refused', 'The provider declined this request.');
  if (r.stop_reason === 'max_tokens') return fail('truncated', 'The reply was cut off.');
  const blocks = Array.isArray(r.content) ? r.content : [];
  const text = blocks.map(asRecord).find((b) => b?.type === 'text')?.text;
  return typeof text === 'string' && text ? { ok: true, text } : fail('invalid_output', 'The provider returned no text.');
}

export function parseOpenAiReply(json: unknown): TextOutcome {
  const r = asRecord(json);
  if (!r) return fail('invalid_output', 'The reply wasn’t readable.');
  if (r.status === 'failed') return fail('server', 'The provider couldn’t finish that request.');
  if (r.status === 'incomplete') {
    const reason = asRecord(r.incomplete_details)?.reason;
    return reason === 'content_filter' ? fail('refused', 'The provider declined this request.') : fail('truncated', 'The reply was cut off.');
  }
  const items = Array.isArray(r.output) ? r.output : [];
  for (const raw of items) {
    const item = asRecord(raw);
    if (item?.type !== 'message') continue;
    // The message parts live on the item; tolerate a nested `message` wrapper too.
    const parts = Array.isArray(item.content) ? item.content : Array.isArray(asRecord(item.message)?.content) ? (asRecord(item.message)!.content as unknown[]) : [];
    for (const p of parts.map(asRecord)) {
      if (p?.type === 'refusal') return fail('refused', 'The provider declined this request.');
      if (p?.type === 'output_text' && typeof p.text === 'string' && p.text) return { ok: true, text: p.text };
    }
  }
  return fail('invalid_output', 'The provider returned no text.');
}

export const parseReply = (provider: AiConfig['provider'], json: unknown): TextOutcome =>
  provider === 'anthropic' ? parseAnthropicReply(json) : parseOpenAiReply(json);

// ---- key check ------------------------------------------------------------------

export function buildModelsCall(cfg: Pick<AiConfig, 'provider' | 'apiKey'>): HttpCall {
  return cfg.provider === 'anthropic'
    ? { url: 'https://api.anthropic.com/v1/models?limit=100', init: { method: 'GET', headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': ANTHROPIC_VERSION } } }
    : { url: 'https://api.openai.com/v1/models', init: { method: 'GET', headers: { authorization: `Bearer ${cfg.apiKey}` } } };
}

/** Both providers answer `{ data: [{ id }] }`. */
export function modelIdsFrom(json: unknown): string[] {
  const data = asRecord(json)?.data;
  return Array.isArray(data) ? data.map((m) => asRecord(m)?.id).filter((id): id is string => typeof id === 'string') : [];
}
