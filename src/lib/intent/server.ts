// Server-side intent extraction. Deliberately free of any runtime SDK import
// (types only) and of any platform API, so it is testable in Node, safe to
// sit near app code without pulling the SDK into the mobile bundle, and
// deployable behind any fetch-style host (Vercel/Next route, Supabase Edge
// Function, Cloudflare Worker). The deployment entry wires in the real
// Anthropic client and an `authorize` check — see server/interpret-intent.ts.
import type Anthropic from '@anthropic-ai/sdk';
import { ARC_TEMPLATES } from '../engines/arc/templates';
import { INTENT_SYSTEM_PROMPT, buildIntentUserMessage } from './prompt';
import { readingIntentJsonSchema, type ReadingIntent } from './schema';
import { parseReadingIntentJson } from './validate';

export const INTENT_MODEL = 'claude-opus-5-5';
export const MAX_MESSAGE_CHARS = 2000;

/** Only the slice of the SDK this file uses, so tests can pass a fake. */
export interface IntentClient {
  beta: { messages: { create: (params: Anthropic.Beta.MessageCreateParamsNonStreaming) => Promise<Anthropic.Beta.BetaMessage> } };
}

export class IntentError extends Error {
  constructor(readonly code: 'refused' | 'truncated' | 'invalid_output' | 'empty', message: string) {
    super(message);
    this.name = 'IntentError';
  }
}

export async function extractReadingIntent(text: string, client: IntentClient): Promise<ReadingIntent> {
  const journeys = Object.values(ARC_TEMPLATES).map((t) => ({ key: t.key, title: t.title, character: t.character }));
  const response = await client.beta.messages.create({
    model: INTENT_MODEL,
    // Short structured extraction; adaptive thinking still draws on this budget, so leave room.
    max_tokens: 8000,
    // Re-run on the recommended fallback model if a safety classifier declines the request.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    // Extraction is a simple task: keep effort low (this model's default is medium).
    output_config: { effort: 'low', format: { type: 'json_schema', schema: readingIntentJsonSchema() } },
    system: INTENT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildIntentUserMessage(text, journeys) }],
  });

  // Branch on stop_reason before reading content: a refusal or truncation can
  // leave content empty or cut off mid-JSON.
  if (response.stop_reason === 'refusal') throw new IntentError('refused', 'The request was declined.');
  if (response.stop_reason === 'max_tokens') throw new IntentError('truncated', 'The reply was cut off.');

  const block = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text');
  if (!block) throw new IntentError('empty', 'The model returned no text.');
  const intent = parseReadingIntentJson(block.text);
  if (!intent) throw new IntentError('invalid_output', 'The reply did not match the expected structure.');
  return intent;
}

export interface HandlerDeps {
  client: IntentClient;
  /** REQUIRED. This endpoint spends money per call, so there is no default-allow:
   *  the deployment must decide who may call it (e.g. verify a user session). */
  authorize: (req: Request) => boolean | Promise<boolean>;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function handleIntentRequest(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!(await deps.authorize(req))) return json(401, { error: 'unauthorized' });

  let body: unknown;
  try { body = await req.json(); } catch { return json(400, { error: 'invalid_json' }); }
  const text = typeof body === 'object' && body !== null ? (body as { text?: unknown }).text : undefined;
  if (typeof text !== 'string' || !text.trim()) return json(400, { error: 'missing_text' });
  if (text.length > MAX_MESSAGE_CHARS) return json(413, { error: 'too_long', maxChars: MAX_MESSAGE_CHARS });

  try {
    const intent = await extractReadingIntent(text.trim(), deps.client);
    return json(200, { intent });
  } catch (e) {
    if (e instanceof IntentError) return json(e.code === 'refused' ? 422 : 502, { error: e.code });
    // Upstream/API failure: do not leak internals to the caller.
    return json(502, { error: 'upstream_error' });
  }
}
